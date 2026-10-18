import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadWordBank } from '@party/content';
import { IMPOSTER_VOTE_MS, type ImposterView, type PlayerId } from '@party/shared';
import { seededRng } from '../engine/rng';
import { PRESENCE_GRACE_MS, Room } from './room';

const BANK = loadWordBank();

function setup(names: string[]) {
  let gameChanges = 0;
  const moved: { from: PlayerId; to: PlayerId }[] = [];
  const room = new Room(
    'ABCD',
    'imposter',
    {
      changed: () => {},
      gameChanged: () => gameChanges++,
      sessionEnded: () => {},
      seatMoved: (_r, from, to) => moved.push({ from, to }),
      closed: () => {},
    },
    { bank: BANK, rng: () => seededRng(42) },
  );
  const ids = names.map((name) => {
    const r = room.join(name);
    if (!r.ok) throw new Error(r.code);
    room.attach(r.value.playerId);
    return r.value.playerId;
  });
  const host = ids[0] as PlayerId;
  const view = (id: PlayerId) => room.gameViewFor(id)?.view as ImposterView | undefined;
  const act = (id: PlayerId, action: unknown) => room.gameAction(id, view(id)?.phaseSeq ?? 0, action);
  return { room, ids, host, view, act, gameChanges: () => gameChanges, moved };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('starting', () => {
  it('blocks the start with a reason until enough players join', () => {
    const { room, host } = setup(['Asha', 'Ravi']);
    expect(room.start(host)).toEqual({ ok: false, code: 'START_BLOCKED', message: 'Need 1 more player' });
  });

  it('validates and clamps settings', () => {
    const { room, host, ids } = setup(['Asha', 'Ravi', 'Meera']);
    expect(room.setSettings(ids[1] as string, {})).toMatchObject({ ok: false, code: 'NOT_HOST' });
    expect(room.setSettings(host, { genres: [] })).toMatchObject({ ok: false, code: 'INVALID_SETTINGS' });
    const ok = room.setSettings(host, { genres: ['animals'], difficulty: 'hard', imposters: 2, maxRounds: 5 });
    expect(ok.ok).toBe(true);
    // 2 imposters need 8 players: clamped to 1.
    expect(room.info().settings).toEqual({ genres: ['animals'], difficulty: 'hard', imposters: 1, maxRounds: 5 });
  });

  it('starts a game and gives each player only their own view', () => {
    const { room, host, ids, view, gameChanges } = setup(['Asha', 'Ravi', 'Meera', 'Kiran']);
    expect(room.start(host).ok).toBe(true);
    expect(room.info().status).toBe('playing');
    expect(gameChanges()).toBe(1);
    const views = ids.map((id) => view(id));
    expect(views.filter((v) => v?.you.role === 'imposter')).toHaveLength(1);
    for (const [i, v] of views.entries()) expect(v?.you.id).toBe(ids[i]);
  });

  it('puts people who join mid-game in a waiting seat, with no view', () => {
    const { room, host } = setup(['Asha', 'Ravi', 'Meera']);
    room.start(host);
    const late = room.join('Late');
    if (!late.ok) throw new Error();
    expect(room.info().members.find((m) => m.id === late.value.playerId)?.seat).toBe('waiting');
    expect(room.gameViewFor(late.value.playerId)).toBeNull();
    expect(room.gameAction(late.value.playerId, 1, { type: 'startVote' })).toMatchObject({ code: 'NOT_ALLOWED' });
  });
});

describe('playing', () => {
  it('rejects stale actions by phase number', () => {
    const { room, host } = setup(['Asha', 'Ravi', 'Meera']);
    room.start(host);
    expect(room.gameAction(host, 99, { type: 'startVote' })).toMatchObject({ code: 'STALE_PHASE' });
    expect(room.gameAction(host, 1, { type: 'nonsense' })).toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('times out a vote via the scheduler', () => {
    const { room, host, view, act } = setup(['Asha', 'Ravi', 'Meera', 'Kiran']);
    room.start(host);
    expect(act(host, { type: 'startVote' }).ok).toBe(true);
    expect(view(host)?.phase).toBe('vote');
    vi.advanceTimersByTime(IMPOSTER_VOTE_MS);
    expect(view(host)?.phase).toBe('result');
  });

  it('tells the game when a player goes away', () => {
    const { room, host, ids, view, act } = setup(['Asha', 'Ravi', 'Meera', 'Kiran', 'Dev']);
    room.start(host);
    act(host, { type: 'startVote' });
    const away = ids[4] as string;
    room.detach(away);
    vi.advanceTimersByTime(PRESENCE_GRACE_MS);
    // Everyone else votes skip: the vote closes without waiting for the away player.
    for (const id of ids.slice(0, 4)) act(id, { type: 'vote', target: 'skip' });
    expect(view(host)?.phase).toBe('result');
  });

  it('host can end the game; results reveal roles; play again and back to lobby', () => {
    const { room, host, ids } = setup(['Asha', 'Ravi', 'Meera']);
    room.start(host);
    expect(room.endGame(ids[1] as string)).toMatchObject({ code: 'NOT_HOST' });
    expect(room.endGame(host).ok).toBe(true);
    const info = room.info();
    expect(info.status).toBe('results');
    expect(info.result?.headline).toBe('Game ended by host');
    expect(info.result?.roles).toHaveLength(3);

    expect(room.playAgain(host).ok).toBe(true);
    expect(room.info().status).toBe('playing');
    room.endGame(host);
    expect(room.toLobby(host).ok).toBe(true);
    expect(room.info()).toMatchObject({ status: 'lobby', result: null });
  });

  it('a player who leaves mid-game is kept as left, then dropped before the next game', () => {
    const { room, host, ids } = setup(['Asha', 'Ravi', 'Meera', 'Kiran']);
    room.start(host);
    room.leave(ids[3] as string);
    expect(room.info().members.find((m) => m.id === ids[3])?.presence).toBe('left');
    room.endGame(host);
    room.playAgain(host);
    expect(room.info().members.map((m) => m.id)).not.toContain(ids[3]);
  });
});

describe('seat reassign', () => {
  it('moves a waiting member into an away seat, keeping the seat id', () => {
    const { room, host, ids, moved } = setup(['Asha', 'Ravi', 'Meera']);
    room.start(host);
    const lost = ids[2] as string;
    room.detach(lost);
    vi.advanceTimersByTime(PRESENCE_GRACE_MS);
    const newcomer = room.join('Meera2');
    if (!newcomer.ok) throw new Error();
    room.attach(newcomer.value.playerId);

    expect(room.reassignSeat(ids[1] as string, lost, newcomer.value.playerId)).toMatchObject({ code: 'NOT_HOST' });
    expect(room.reassignSeat(host, ids[1] as string, newcomer.value.playerId)).toMatchObject({ code: 'INVALID_TARGET' });
    expect(room.reassignSeat(host, lost, newcomer.value.playerId).ok).toBe(true);

    expect(moved).toEqual([{ from: newcomer.value.playerId, to: lost }]);
    expect(room.resume(newcomer.value.sessionToken)).toEqual({ ok: true, value: lost });
    const members = room.info().members;
    expect(members.find((m) => m.id === lost)?.presence).toBe('online');
    expect(members.some((m) => m.id === newcomer.value.playerId)).toBe(false);
    expect(room.gameViewFor(lost)).not.toBeNull();
  });
});
