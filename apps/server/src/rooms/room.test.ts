import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadWordBank } from '@party/content';
import type { PlayerId, SessionEndReason } from '@party/shared';
import {
  EMPTY_ROOM_TTL_MS,
  HOST_AWAY_TRANSFER_MS,
  PRESENCE_GRACE_MS,
  ROOM_MAX_AGE_MS,
  Room,
} from './room';

const BANK = loadWordBank();

function setup() {
  const ended: { playerId: PlayerId; reason: SessionEndReason }[] = [];
  let changes = 0;
  let closed = false;
  const room = new Room(
    'ABCD',
    'imposter',
    {
      changed: () => changes++,
      gameChanged: () => {},
      sessionEnded: (_r, playerId, reason) => ended.push({ playerId, reason }),
      seatMoved: () => {},
      closed: () => {
        closed = true;
      },
    },
    { bank: BANK },
  );
  const join = (name: string) => {
    const result = room.join(name);
    if (!result.ok) throw new Error(result.code);
    room.attach(result.value.playerId);
    return result.value;
  };
  return {
    room,
    join,
    ended,
    changes: () => changes,
    closed: () => closed,
    member: (id: PlayerId) => room.info().members.find((m) => m.id === id),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('joining', () => {
  it('makes the first member host and bumps rev on every change', () => {
    const { room, join } = setup();
    const host = join('Asha');
    join('Ravi');
    const info = room.info();
    expect(info.members.map((m) => m.name)).toEqual(['Asha', 'Ravi']);
    expect(info.members.find((m) => m.isHost)?.id).toBe(host.playerId);
    expect(info.rev).toBe(2);
  });

  it('rejects duplicate names case-insensitively', () => {
    const { room, join } = setup();
    join('Asha');
    expect(room.join('asha')).toEqual({ ok: false, code: 'NAME_TAKEN' });
  });

  it('caps the room at 15 members', () => {
    const { room, join } = setup();
    for (let i = 0; i < 15; i++) join(`P${i}`);
    expect(room.join('Extra')).toEqual({ ok: false, code: 'ROOM_FULL' });
  });

  it('frees a name once its owner leaves', () => {
    const { room, join } = setup();
    join('Asha');
    const ravi = join('Ravi');
    room.leave(ravi.playerId);
    expect(room.join('Ravi').ok).toBe(true);
  });

  it('never exposes session tokens in room info', () => {
    const { room, join } = setup();
    const grant = join('Asha');
    expect(JSON.stringify(room.info())).not.toContain(grant.sessionToken);
  });
});

describe('sessions', () => {
  it('resumes with a valid token only', () => {
    const { room, join } = setup();
    const grant = join('Asha');
    expect(room.resume(grant.sessionToken)).toEqual({ ok: true, value: grant.playerId });
    expect(room.resume('x'.repeat(43))).toEqual({ ok: false, code: 'SESSION_INVALID' });
  });

  it('revokes the token of a kicked player', () => {
    const { room, join, ended } = setup();
    const host = join('Asha');
    const ravi = join('Ravi');
    expect(room.kick(host.playerId, ravi.playerId)).toEqual({ ok: true, value: null });
    expect(ended).toEqual([{ playerId: ravi.playerId, reason: 'kicked' }]);
    expect(room.resume(ravi.sessionToken).ok).toBe(false);
    expect(room.info().members).toHaveLength(1);
  });

  it('only lets the host kick, and not themselves', () => {
    const { room, join } = setup();
    const host = join('Asha');
    const ravi = join('Ravi');
    expect(room.kick(ravi.playerId, host.playerId)).toEqual({ ok: false, code: 'NOT_HOST' });
    expect(room.kick(host.playerId, host.playerId)).toEqual({ ok: false, code: 'INVALID_TARGET' });
  });
});

describe('presence', () => {
  it('ignores disconnects shorter than the grace period', () => {
    const { room, join, member } = setup();
    const asha = join('Asha');
    const before = room.info().rev;
    room.detach(asha.playerId);
    vi.advanceTimersByTime(PRESENCE_GRACE_MS - 1);
    room.attach(asha.playerId);
    vi.advanceTimersByTime(PRESENCE_GRACE_MS);
    expect(member(asha.playerId)?.presence).toBe('online');
    expect(room.info().rev).toBe(before);
  });

  it('marks a player away after the grace period, and online when they return', () => {
    const { room, join, member } = setup();
    const asha = join('Asha');
    room.detach(asha.playerId);
    vi.advanceTimersByTime(PRESENCE_GRACE_MS);
    expect(member(asha.playerId)?.presence).toBe('away');
    room.attach(asha.playerId);
    expect(member(asha.playerId)?.presence).toBe('online');
  });
});

describe('host transfer', () => {
  it('passes host to the earliest-joined online member after 60s away', () => {
    const { room, join } = setup();
    const host = join('Asha');
    const ravi = join('Ravi');
    join('Meera');
    room.detach(host.playerId);
    vi.advanceTimersByTime(PRESENCE_GRACE_MS + HOST_AWAY_TRANSFER_MS - 1);
    expect(room.host).toBe(host.playerId);
    vi.advanceTimersByTime(1);
    expect(room.host).toBe(ravi.playerId);
  });

  it('keeps the host if they return in time, and does not hand it back later', () => {
    const { room, join } = setup();
    const host = join('Asha');
    const ravi = join('Ravi');
    room.detach(host.playerId);
    vi.advanceTimersByTime(PRESENCE_GRACE_MS + 10_000);
    room.attach(host.playerId);
    vi.advanceTimersByTime(HOST_AWAY_TRANSFER_MS);
    expect(room.host).toBe(host.playerId);

    room.detach(host.playerId);
    vi.advanceTimersByTime(PRESENCE_GRACE_MS + HOST_AWAY_TRANSFER_MS);
    expect(room.host).toBe(ravi.playerId);
    room.attach(host.playerId);
    expect(room.host).toBe(ravi.playerId);
  });

  it('skips members who are away', () => {
    const { room, join } = setup();
    const host = join('Asha');
    const ravi = join('Ravi');
    const meera = join('Meera');
    room.detach(ravi.playerId);
    room.detach(host.playerId);
    vi.advanceTimersByTime(PRESENCE_GRACE_MS + HOST_AWAY_TRANSFER_MS);
    expect(room.host).toBe(meera.playerId);
  });

  it('transfers when someone comes back if nobody was online at the deadline', () => {
    const { room, join } = setup();
    const host = join('Asha');
    const ravi = join('Ravi');
    room.detach(host.playerId);
    room.detach(ravi.playerId);
    vi.advanceTimersByTime(PRESENCE_GRACE_MS + HOST_AWAY_TRANSFER_MS + 5_000);
    expect(room.host).toBe(host.playerId);
    room.attach(ravi.playerId);
    expect(room.host).toBe(ravi.playerId);
  });

  it('transfers immediately when the host leaves', () => {
    const { room, join } = setup();
    const host = join('Asha');
    const ravi = join('Ravi');
    room.leave(host.playerId);
    expect(room.host).toBe(ravi.playerId);
  });
});

describe('lobby', () => {
  it('reports why the game cannot start', () => {
    const { room, join } = setup();
    join('Asha');
    expect(room.info().startBlockedReason).toBe('Need 2 more players');
    join('Ravi');
    join('Meera');
    expect(room.info().startBlockedReason).toBeNull();
  });

  it('lets only the host change the game', () => {
    const { room, join } = setup();
    const host = join('Asha');
    const ravi = join('Ravi');
    expect(room.setGame(ravi.playerId, 'traitor')).toEqual({ ok: false, code: 'NOT_HOST' });
    expect(room.setGame(host.playerId, 'traitor').ok).toBe(true);
    expect(room.info().gameId).toBe('traitor');
    expect(room.info().startBlockedReason).toBe('Need 3 more players');
  });
});

describe('closing and expiry', () => {
  it('ends every session when the host closes the room', () => {
    const { room, join, ended, closed } = setup();
    const host = join('Asha');
    join('Ravi');
    expect(room.close(host.playerId).ok).toBe(true);
    expect(ended.map((e) => e.reason)).toEqual(['closed', 'closed']);
    expect(closed()).toBe(true);
    expect(room.resume(host.sessionToken).ok).toBe(false);
  });

  it('closes when the last member leaves', () => {
    const { room, join, closed } = setup();
    const host = join('Asha');
    room.leave(host.playerId);
    expect(closed()).toBe(true);
  });

  it('expires after 30 minutes with nobody online', () => {
    const { room, join } = setup();
    const host = join('Asha');
    room.detach(host.playerId);
    vi.advanceTimersByTime(PRESENCE_GRACE_MS);
    expect(room.isExpired(Date.now() + EMPTY_ROOM_TTL_MS - 1)).toBe(false);
    expect(room.isExpired(Date.now() + EMPTY_ROOM_TTL_MS)).toBe(true);
  });

  it('does not expire while someone is online, until the 3-hour cap', () => {
    const { room, join } = setup();
    join('Asha');
    expect(room.isExpired(Date.now() + EMPTY_ROOM_TTL_MS * 2)).toBe(false);
    expect(room.isExpired(room.createdAt + ROOM_MAX_AGE_MS)).toBe(true);
  });
});
