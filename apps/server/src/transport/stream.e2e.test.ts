/* eslint-disable no-restricted-syntax -- this test plays the client: its emits are client→server, not server emit sites. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, GameStreamOp, PictionaryView, ServerToClientEvents } from '@party/shared';
import { startApp, type App } from '../app';
import { seededRng } from '../engine/rng';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Pictionary draw board over real sockets: strokes reach everyone but the sender, only the
 * drawer can draw, a reconnect gets the whole board, and a typed guess's result reaches only
 * the guesser (ARCHITECTURE §7.4, §8).
 */
describe('draw board over sockets', () => {
  let app: App;
  const clients: Client[] = [];

  beforeAll(async () => {
    app = await startApp({ port: 0, roomCreatesPerMinute: 100, rng: () => seededRng(7) });
  });
  afterAll(async () => {
    for (const c of clients) c.disconnect();
    await app.close();
  });

  function connect(): Promise<Client> {
    const c: Client = io(`http://localhost:${app.port}`, { transports: ['websocket'], forceNew: true });
    clients.push(c);
    return new Promise((resolve) => c.on('connect', () => resolve(c)));
  }

  /** Records views, stream ops and resets for one client. */
  function watch(c: Client) {
    const seen = { view: null as PictionaryView | null, ops: [] as GameStreamOp[], resets: [] as GameStreamOp[][], raw: [] as string[] };
    c.on('game:view', ({ view }) => {
      seen.view = view as PictionaryView;
      seen.raw.push(JSON.stringify(view));
    });
    c.on('game:stream', ({ op }) => {
      seen.ops.push(op);
      seen.raw.push(JSON.stringify(op));
    });
    c.on('game:streamReset', ({ ops }) => {
      seen.resets.push(ops);
      seen.raw.push(JSON.stringify(ops));
    });
    return seen;
  }

  const settle = () => new Promise((r) => setTimeout(r, 150));

  it('relays strokes, restores the board on reconnect, and keeps guesses private', async () => {
    const [a, b, c] = await Promise.all([connect(), connect(), connect()]);
    const seen = [watch(a), watch(b), watch(c)];
    const created = await a.emitWithAck('room:create', { name: 'Asha', gameId: 'pictionary' });
    if (!created.ok) throw new Error(created.error.code);
    const { code } = created.data;
    const joinB = await b.emitWithAck('room:join', { code, name: 'Ravi' });
    const joinC = await c.emitWithAck('room:join', { code, name: 'Meera' });
    if (!joinB.ok || !joinC.ok) throw new Error('join failed');
    const settings = { mode: 'board', genres: ['animals'], difficulty: 'easy', drawSeconds: 150 };
    expect((await a.emitWithAck('lobby:setSettings', { settings })).ok).toBe(true);
    expect((await a.emitWithAck('game:start', {})).ok).toBe(true);
    await settle();

    const view = seen[0]?.view as PictionaryView;
    expect(view).toMatchObject({ mode: 'board', phase: 'drawing' });
    expect(view.deadline).toBeGreaterThan(Date.now() + 140_000);
    const key = view.channelKey as string;
    const players = [a, b, c];
    const ids = [created.data.playerId, joinB.data.playerId, joinC.data.playerId];
    const di = ids.indexOf(view.drawerId);
    const drawer = players[di] as Client;
    const gi = (di + 1) % 3;
    const guesser = players[gi] as Client;

    // Only the drawer's ops go through, to everyone but the drawer.
    const op: GameStreamOp = { t: 'seg', id: 'one', color: 1, size: 2, pts: [[10, 10], [500, 500]] };
    guesser.emit('game:stream', { channelKey: key, op: { ...op, id: 'fake' } });
    drawer.emit('game:stream', { channelKey: key, op });
    drawer.emit('game:stream', { channelKey: 'stale', op: { ...op, id: 'old' } });
    await settle();
    for (let i = 0; i < 3; i++) expect(seen[i]?.ops).toEqual(i === di ? [] : [op]);

    // A reconnecting guesser gets the whole board.
    const session = await guesser.emitWithAck('room:resume', { code, sessionToken: (gi === 1 ? joinB : joinC).data.sessionToken });
    expect(session.ok).toBe(true);
    await settle();
    expect(seen[gi]?.resets.at(-1)).toEqual([op]);

    // A wrong guess: the result comes back in the ack only, and nobody's payload has the text.
    const wrong = await guesser.emitWithAck('game:action', { phaseSeq: view.phaseSeq, action: { type: 'guess', text: 'zq not it' } });
    expect(wrong).toEqual({ ok: true, data: { guess: 'wrong' } });
    await settle();
    for (const s of seen) expect(s.raw.join()).not.toContain('zq not it');

    // The drawer can't guess; the host can still tap Guessed it.
    const own = await drawer.emitWithAck('game:action', { phaseSeq: view.phaseSeq, action: { type: 'guess', text: 'x' } });
    expect(own.ok).toBe(false);
    expect((await a.emitWithAck('game:action', { phaseSeq: view.phaseSeq, action: { type: 'guessed' } })).ok).toBe(true);
    await settle();
    expect(seen[gi]?.view).toMatchObject({ phase: 'reveal', guessed: true, guessedBy: null, timeUp: false, channelKey: key });

    // Nobody can draw at the reveal.
    drawer.emit('game:stream', { channelKey: key, op: { ...op, id: 'late' } });
    await settle();
    expect(seen[gi]?.ops).toEqual([op]);
  }, 20_000);
});
