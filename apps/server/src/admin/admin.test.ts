import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadWordBank } from '@party/content';
import { seededRng } from '../engine/rng';
import { PRESENCE_GRACE_MS } from '../rooms/room';
import { RoomManager } from '../rooms/roomManager';
import { ADMIN_SESSION_MS, AdminAuth } from './auth';
import { ServerControls } from './controls';

describe('AdminAuth', () => {
  it('accepts only the exact credentials', () => {
    const auth = new AdminAuth({ username: 'admin', password: 'secret-pass' });
    expect(auth.login('admin', 'secret-pass')).toEqual(expect.any(String));
    expect(auth.login('admin', 'secret-pas')).toBeNull();
    expect(auth.login('Admin', 'secret-pass')).toBeNull();
    expect(auth.login('', '')).toBeNull();
  });

  it('expires sessions and supports logout', () => {
    let now = 0;
    const auth = new AdminAuth({ username: 'a', password: 'b' }, () => now);
    const token = auth.login('a', 'b') as string;
    expect(auth.verify(token)).toBe(true);
    expect(auth.verify('forged')).toBe(false);
    expect(auth.verify(undefined)).toBe(false);
    now = ADMIN_SESSION_MS;
    expect(auth.verify(token)).toBe(false);
    const again = auth.login('a', 'b') as string;
    auth.logout(again);
    expect(auth.verify(again)).toBe(false);
  });
});

describe('RoomManager admin helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const events = { changed: () => {}, gameChanged: () => {}, sessionEnded: () => {}, seatMoved: () => {}, closed: () => {} };

  it('finds and closes stale rooms only', () => {
    const manager = new RoomManager(events, { bank: loadWordBank(), rng: () => seededRng(1) });
    const a = manager.create('Asha', 'imposter');
    const b = manager.create('Ravi', 'imposter');
    if (!a.ok || !b.ok) throw new Error('create failed');
    a.value.room.attach(a.value.grant.playerId);
    b.value.room.attach(b.value.grant.playerId);
    a.value.room.detach(a.value.grant.playerId);
    vi.advanceTimersByTime(PRESENCE_GRACE_MS);

    expect(a.value.room.isStale).toBe(true);
    expect(a.value.room.adminSummary().emptySince).not.toBeNull();
    expect(b.value.room.isStale).toBe(false);
    expect(manager.closeStale()).toBe(1);
    expect(manager.list().map((r) => r.code)).toEqual([b.value.room.code]);
  });

  it('counts rooms, games and peaks', () => {
    const manager = new RoomManager(events, { bank: loadWordBank(), rng: () => seededRng(1) });
    const created = manager.create('Asha', 'imposter');
    if (!created.ok) throw new Error('create failed');
    const { room, grant } = created.value;
    for (const name of ['Ravi', 'Meera']) room.join(name);
    room.start(grant.playerId);
    room.endGame(grant.playerId);
    const usage = manager.stats.snapshot();
    expect(usage).toMatchObject({ roomsCreated: 1, gamesFinished: 1, gamesEndedByHost: 1, peakRooms: 1 });
    expect(usage.gamesStarted.imposter).toBe(1);
    expect(usage.peakOnlinePlayers).toBe(3);
  });

  it('summarises rooms without game state', () => {
    const manager = new RoomManager(events, { bank: loadWordBank(), rng: () => seededRng(1) });
    const created = manager.create('Asha', 'imposter');
    if (!created.ok) throw new Error('create failed');
    const { room, grant } = created.value;
    for (const name of ['Ravi', 'Meera']) room.join(name);
    room.start(grant.playerId);
    const summary = room.adminSummary();
    expect(Object.keys(summary).sort()).toEqual(
      ['code', 'createdAt', 'emptySince', 'expiresAt', 'gameId', 'lastActiveAt', 'members', 'status'].sort(),
    );
    expect(Object.keys(summary.members[0] ?? {}).sort()).toEqual(['isHost', 'name', 'presence', 'seat']);
  });
});

describe('ServerControls releases', () => {
  it('releases only built games, starting from the given defaults', () => {
    const controls = new ServerControls(['imposter', 'traitor'], ['imposter', 'pictionary']);
    expect(controls.status().released).toEqual(['imposter']); // pictionary isn't built
    expect(controls.setReleased('pictionary', true)).toBe(false);
    let notified = 0;
    controls.onChange(() => notified++);
    expect(controls.setReleased('traitor', true)).toBe(true);
    expect(controls.releasedMap()).toEqual({ imposter: true, traitor: true, pictionary: false });
    expect(notified).toBe(1);
    controls.setReleased('traitor', true); // no change, no notice
    expect(notified).toBe(1);
  });
});
