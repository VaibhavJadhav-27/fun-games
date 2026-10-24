import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type {
  Ack,
  AckData,
  ClientEventName,
  ClientPayload,
  ClientToServerEvents,
  GameView,
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
  let view: GameView | null = null;
  socket.onAny((event: string, payload: unknown) => frames.push({ event, payload }));
  socket.on('game:view', (payload) => {
    view = payload.view;
  });
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
    view: () => view,
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
        expect(['room:state', 'session:ended', 'game:view', 'session:updated', 'server:status']).toContain(frame.event);
        const raw = JSON.stringify(frame.payload);
        expect(raw).not.toContain(grant.sessionToken);
        expect(raw).not.toContain(raviGrant.sessionToken);
      }
    }
  });

  it('plays a full Imposter game; the wire never carries a secret to the wrong player', async () => {
    const names = ['Asha', 'Ravi', 'Meera', 'Kiran'];
    const players = names.map(() => client());
    const [host] = players as [ReturnType<typeof client>];
    const { code } = await host.call('room:create', { name: names[0] as string, gameId: 'imposter' });
    for (const [i, p] of players.entries()) {
      if (i > 0) await p.call('room:join', { code, name: names[i] as string });
    }
    await until(() => host.room()?.members.length === 4);
    await host.call('lobby:setSettings', {
      settings: { source: 'genres', genres: ['fruits-vegetables'], difficulty: 'easy', imposters: 1, maxRounds: 3 },
    });
    await host.call('game:start', {});
    await until(() => players.every((p) => p.view() !== null));

    const imposter = players.find((p) => p.view()?.you.role === 'imposter');
    const crew = players.filter((p) => p !== imposter);
    expect(imposter).toBeDefined();
    expect(crew).toHaveLength(3);
    const crewView = crew[0]?.view();
    if (!crewView || !('word' in crewView) || !imposter) throw new Error('bad setup');
    const word = crewView.word;
    const imposterId = imposter.view()?.you.id as string;

    // Host opens the vote; live counts show up for everyone.
    await host.call('game:action', { phaseSeq: host.view()?.phaseSeq ?? 0, action: { type: 'startVote' } });
    await until(() => players.every((p) => p.view()?.phase === 'vote'));
    const firstVoter = crew.find((p) => p !== host) ?? (crew[0] as ReturnType<typeof client>);
    await firstVoter.call('game:action', {
      phaseSeq: firstVoter.view()?.phaseSeq ?? 0,
      action: { type: 'vote', target: imposterId },
    });
    await until(() => imposter.view()?.vote?.counts.find((c) => c.target === imposterId)?.count === 1);

    // Everyone else votes: the vote closes early and the imposter is caught.
    for (const p of players) {
      if (p === firstVoter) continue;
      const target = p === imposter ? 'skip' : imposterId;
      await p.call('game:action', { phaseSeq: p.view()?.phaseSeq ?? 0, action: { type: 'vote', target } });
    }
    await until(() => players.every((p) => p.view()?.phase === 'lastGuess'));
    expect(host.view()?.result).toMatchObject({ outcome: 'caught', evictedId: imposterId });

    // Only the imposter may guess; a wrong guess hands the win to the crew.
    const bystander = crew[0] as ReturnType<typeof client>;
    expect(
      await bystander.attempt('game:action', {
        phaseSeq: bystander.view()?.phaseSeq ?? 0,
        action: { type: 'guess', text: 'x' },
      }),
    ).toMatchObject({ ok: false, error: { code: 'NOT_ALLOWED' } });
    await imposter.call('game:action', {
      phaseSeq: imposter.view()?.phaseSeq ?? 0,
      action: { type: 'guess', text: 'definitely wrong' },
    });
    await until(() => players.every((p) => p.room()?.status === 'results'));
    expect(host.room()?.result?.headline).toBe('Crewmates win!');
    expect(host.room()?.result?.reveals).toContainEqual({ label: 'Word', value: word });

    // Wire check: before the results, nothing the imposter received contained the word,
    // and no crewmate ever received another player's role before eviction.
    const beforeResults = (frames: { event: string; payload: unknown }[]) =>
      frames.slice(
        0,
        frames.findIndex((f) => f.event === 'room:state' && (f.payload as RoomInfo).status === 'results'),
      );
    for (const frame of beforeResults(imposter.frames)) {
      expect(JSON.stringify(frame.payload)).not.toContain(JSON.stringify(word));
    }
    for (const p of crew) {
      for (const frame of beforeResults(p.frames)) {
        const raw = JSON.stringify(frame.payload);
        expect(raw).not.toContain('fellowImposters');
        if (frame.event === 'game:view') {
          const v = (frame.payload as { view: GameView }).view;
          expect(v.you.id).toBe(p.view()?.you.id);
          for (const pl of v.players) if (!pl.evicted) expect(pl.revealedRole).toBeNull();
          if (v.phase === 'vote') expect(raw).not.toContain('ballots');
        }
      }
    }

    // Host plays again: a fresh game starts for the same players.
    await host.call('results:playAgain', {});
    await until(() => players.every((p) => p.room()?.status === 'playing' && p.view()?.phase === 'discussion'));
  });

  it("never sends the host's custom word to anyone else", async () => {
    const names = ['Asha', 'Ravi', 'Meera', 'Kiran'];
    const players = names.map(() => client());
    const [host, ...others] = players as [ReturnType<typeof client>, ...ReturnType<typeof client>[]];
    const { code } = await host.call('room:create', { name: names[0] as string, gameId: 'imposter' });
    for (const [i, p] of others.entries()) await p.call('room:join', { code, name: names[i + 1] as string });
    await until(() => host.room()?.members.length === 4);
    await host.call('lobby:setSettings', {
      settings: { source: 'custom', genres: ['animals'], difficulty: 'medium', imposters: 1, maxRounds: 3, customWord: 'Zebracorn' },
    });
    await host.call('game:start', {});
    await until(() => players.every((p) => p.view() !== null));
    expect(host.view()?.you.role).toBe('moderator');
    const imposter = others.find((p) => p.view()?.you.role === 'imposter');
    expect(imposter).toBeDefined();
    await host.call('game:end', {});
    await until(() => players.every((p) => p.room()?.status === 'results'));

    // RoomInfo never carried it; only crewmates' own views did, until the reveal.
    for (const p of players) {
      for (const f of p.frames) {
        if (f.event === 'room:state' && (f.payload as RoomInfo).status !== 'results') {
          expect(JSON.stringify(f.payload)).not.toContain('Zebracorn');
        }
      }
    }
    for (const f of imposter?.frames ?? []) {
      if (f.event === 'game:view') expect(JSON.stringify(f.payload)).not.toContain('Zebracorn');
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
