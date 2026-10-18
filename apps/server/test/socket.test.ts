import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type {
  Ack,
  AckData,
  ClientEventName,
  ClientPayload,
  ClientToServerEvents,
  RoomInfo,
  ServerToClientEvents,
  SessionEndReason,
} from '@party/shared';
import { startApp, type App } from '../src/app';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let app: App;
const clients: Client[] = [];

beforeAll(async () => {
  app = await startApp({ port: 0, roomCreatesPerMinute: 1000 });
});

afterAll(async () => {
  for (const c of clients) c.disconnect();
  await app.close();
});

/** A test client that records every frame it receives. */
function client() {
  const socket: Client = connect(`http://localhost:${app.port}`, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
  clients.push(socket);
  const frames: { event: string; payload: unknown }[] = [];
  let latest: RoomInfo | null = null;
  let ended: SessionEndReason | null = null;
  socket.onAny((event: string, payload: unknown) => frames.push({ event, payload }));
  socket.on('room:state', (info) => {
    latest = info;
  });
  socket.on('session:ended', ({ reason }) => {
    ended = reason;
  });

  async function attempt<E extends ClientEventName>(event: E, payload: ClientPayload<E>): Promise<Ack<AckData[E]>> {
    return (await rawEmit(socket, event, payload)) as Ack<AckData[E]>;
  }

  async function call<E extends ClientEventName>(event: E, payload: ClientPayload<E>): Promise<AckData[E]> {
    const res = await attempt(event, payload);
    if (!res.ok) throw new Error(res.error.code);
    return res.data;
  }

  return {
    socket,
    frames,
    call,
    attempt,
    room: () => latest,
    ended: () => ended,
    connected: () => new Promise<void>((resolve) => socket.on('connect', () => resolve())),
  };
}

/** Untyped emit-with-ack, so tests can also send malformed payloads. */
function rawEmit(socket: Client, event: string, payload: unknown): Promise<Ack<unknown>> {
  const timed = socket.timeout(2000) as unknown as {
    emitWithAck(e: string, p: unknown): Promise<Ack<unknown>>;
  };
  return timed.emitWithAck(event, payload);
}

async function until(check: () => boolean, ms = 2000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe('rooms over sockets', () => {
  it('creates, joins, refreshes and keeps the seat', async () => {
    const host = client();
    const grant = await host.call('room:create', { name: 'Asha', gameId: 'imposter' });
    expect(grant.code).toMatch(/^[A-Z]{4}$/);

    const ravi = client();
    const meera = client();
    const raviGrant = await ravi.call('room:join', { code: grant.code.toLowerCase(), name: 'Ravi' });
    await meera.call('room:join', { code: grant.code, name: 'Meera' });

    await until(() => host.room()?.members.length === 3);
    expect(host.room()?.startBlockedReason).toBeNull();

    // "Refresh": a brand-new socket resumes with the stored token.
    ravi.socket.disconnect();
    const raviAgain = client();
    const resumed = await raviAgain.call('room:resume', { code: grant.code, sessionToken: raviGrant.sessionToken });
    expect(resumed.playerId).toBe(raviGrant.playerId);
    await until(() => raviAgain.room()?.members.length === 3);
    expect(raviAgain.room()?.members.find((m) => m.id === raviGrant.playerId)?.presence).toBe('online');
  });

  it('rejects taken names and unknown rooms', async () => {
    const host = client();
    const { code } = await host.call('room:create', { name: 'Asha', gameId: 'imposter' });
    const other = client();
    expect(await other.attempt('room:join', { code, name: ' ASHA ' })).toMatchObject({
      ok: false,
      error: { code: 'NAME_TAKEN' },
    });
    expect(await other.attempt('room:join', { code: 'ZZZZ', name: 'X' })).toMatchObject({
      ok: false,
      error: { code: 'ROOM_NOT_FOUND' },
    });
    expect(await other.attempt('room:join', { code, name: '' })).toMatchObject({
      ok: false,
      error: { code: 'BAD_REQUEST' },
    });
  });

  it('replaces an older socket for the same player', async () => {
    const host = client();
    const grant = await host.call('room:create', { name: 'Asha', gameId: 'imposter' });
    const secondTab = client();
    await secondTab.call('room:resume', { code: grant.code, sessionToken: grant.sessionToken });
    await until(() => host.ended() === 'replaced');
    // The old socket no longer speaks for the player.
    expect(await host.attempt('lobby:setGame', { gameId: 'traitor' })).toMatchObject({
      ok: false,
      error: { code: 'NOT_IN_ROOM' },
    });
    await secondTab.call('lobby:setGame', { gameId: 'traitor' });
    await until(() => secondTab.room()?.gameId === 'traitor');
  });

  it('kicks a player: they are told, and their token stops working', async () => {
    const host = client();
    const { code } = await host.call('room:create', { name: 'Asha', gameId: 'imposter' });
    const ravi = client();
    const raviGrant = await ravi.call('room:join', { code, name: 'Ravi' });
    await ravi.attempt('lobby:kick', { playerId: 'nope' }); // not host: rejected
    await host.call('lobby:kick', { playerId: raviGrant.playerId });
    await until(() => ravi.ended() === 'kicked');
    await until(() => host.room()?.members.length === 1);
    expect(await client().attempt('room:resume', { code, sessionToken: raviGrant.sessionToken })).toMatchObject({
      ok: false,
      error: { code: 'SESSION_INVALID' },
    });
  });

  it('closes the room for everyone', async () => {
    const host = client();
    const { code } = await host.call('room:create', { name: 'Asha', gameId: 'imposter' });
    const ravi = client();
    await ravi.call('room:join', { code, name: 'Ravi' });
    await host.call('room:close', {});
    await until(() => ravi.ended() === 'closed' && host.ended() === 'closed');
    expect(await client().attempt('room:join', { code, name: 'Late' })).toMatchObject({
      ok: false,
      error: { code: 'ROOM_NOT_FOUND' },
    });
  });

  it('only ever sends room info and session events, never tokens', async () => {
    const host = client();
    const grant = await host.call('room:create', { name: 'Asha', gameId: 'imposter' });
    const ravi = client();
    const raviGrant = await ravi.call('room:join', { code: grant.code, name: 'Ravi' });
    await until(() => host.room()?.members.length === 2);
    for (const c of [host, ravi]) {
      for (const frame of c.frames) {
        expect(['room:state', 'session:ended']).toContain(frame.event);
        const raw = JSON.stringify(frame.payload);
        expect(raw).not.toContain(grant.sessionToken);
        expect(raw).not.toContain(raviGrant.sessionToken);
      }
    }
  });

  it('rejects malformed payloads without crashing', async () => {
    const c = client();
    await c.connected();
    const emit = (event: string, payload: unknown) => rawEmit(c.socket, event, payload);
    expect(await emit('room:create', { name: 'A', gameId: 'chess' })).toMatchObject({ ok: false });
    expect(await emit('room:create', 'not an object')).toMatchObject({ ok: false });
    expect(await emit('room:create', { name: 'A', gameId: 'imposter', extra: 1 })).toMatchObject({ ok: false });
    expect(await c.attempt('time:sync', {})).toMatchObject({ ok: true });
  });
});
