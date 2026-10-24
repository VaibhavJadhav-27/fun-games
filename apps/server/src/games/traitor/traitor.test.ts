import { describe, expect, it } from 'vitest';
import {
  TRAITOR_AWAY_CUTOFF_MS,
  TRAITOR_NIGHT_MS,
  TRAITOR_VOTE_MS,
  autoTraitorCount,
  maxTraitorCount,
  traitorDefaultSettings,
} from '@party/shared';
import { traitor } from './index';
import { TraitorHarness } from './testing';

function harness(n: number, settings = {}, seed = 1): TraitorHarness {
  return new TraitorHarness(n, settings, seed);
}

describe('roles', () => {
  it('scales the traitor count with the group size', () => {
    expect([5, 6, 7, 11, 12, 15].map(autoTraitorCount)).toEqual([1, 1, 2, 2, 3, 3]);
    expect([5, 7, 10, 13, 15].map(maxTraitorCount)).toEqual([1, 2, 3, 4, 4]);
    for (let seed = 1; seed <= 20; seed++) {
      expect(harness(5, {}, seed).traitors).toHaveLength(1);
      expect(harness(9, {}, seed).traitors).toHaveLength(2);
      expect(new Set(harness(13, { traitors: 4 }, seed).traitors).size).toBe(4);
    }
  });

  it('validates and clamps the host override against the player count', () => {
    const { settings } = traitor;
    expect(settings.validate({ ...traitorDefaultSettings(), traitors: 2 }, 6)).toMatch(/at most 1 traitor/);
    expect(settings.validate({ ...traitorDefaultSettings(), traitors: 2 }, 7)).toBeNull();
    expect(settings.clamp({ ...traitorDefaultSettings(), traitors: 3 }, 8)).toMatchObject({ traitors: 2 });
    expect(settings.clamp(traitorDefaultSettings(), 5)).toMatchObject({ traitors: 'auto' });
  });

  it('starts on the role reveal; the host begins the first night', () => {
    const h = harness(5);
    expect(h.state.phase).toEqual({ name: 'roles', seq: 1, deadline: null });
    expect(traitor.nextWakeup(h.state)).toBeNull();
    expect(h.act('p2', { type: 'continue' })).toEqual({ ok: false, error: 'NOT_HOST' });
    h.continue();
    expect(h.state.phase).toMatchObject({ name: 'night', deadline: h.now + TRAITOR_NIGHT_MS });
    expect(h.state.round).toBe(1);
  });
});

describe('night', () => {
  it('waits for everyone to lock in, so the traitor locking never ends the night by itself', () => {
    const h = harness(5); // 1 traitor, 4 civilians
    h.continue();
    const [t] = h.traitors as [string];
    const [victim, last] = h.civilians as [string, string];
    h.lockCivilians([last]); // 3 civilians locked
    h.do(t, { type: 'pick', target: victim });
    h.do(t, { type: 'lock' });
    expect(h.state.phase.name).toBe('night'); // still waiting for the last civilian
    h.lockCivilians();
    expect(h.state.phase.name).toBe('morning');
    expect(h.state.victimId).toBe(victim);
  });

  it('kills once everyone is locked and the traitors agree on one civilian', () => {
    const h = harness(9); // 2 traitors
    h.continue();
    const [a, b] = h.traitors as [string, string];
    const [victim, other] = h.civilians as [string, string];
    h.lockCivilians();
    h.do(a, { type: 'pick', target: victim });
    h.do(a, { type: 'lock' });
    h.do(b, { type: 'pick', target: other });
    h.do(b, { type: 'lock' });
    expect(h.state.phase.name).toBe('night'); // everyone locked, but the traitors disagree
    h.do(b, { type: 'pick', target: victim }); // re-picking unlocks
    expect(h.state.night?.[b]).toEqual({ target: victim, locked: false });
    h.do(b, { type: 'lock' });
    expect(h.state.phase.name).toBe('morning');
    expect(h.state.victimId).toBe(victim);
    expect(h.state.dead).toEqual([{ id: victim, how: 'killed' }]);
  });

  it('kills nobody when the 60s cap passes without agreement', () => {
    const h = harness(5);
    h.continue();
    h.do(h.traitors[0] as string, { type: 'pick', target: h.civilians[0] as string });
    h.advance(TRAITOR_NIGHT_MS - 1);
    expect(h.state.phase.name).toBe('night');
    h.advance(1);
    expect(h.state.phase.name).toBe('morning');
    expect(h.state.victimId).toBeNull();
    expect(h.state.dead).toEqual([]);
  });

  it('only lets traitors target living civilians; civilians pick suspects with no effect', () => {
    const h = harness(9);
    h.continue();
    const [a, b] = h.traitors as [string, string];
    const civ = h.civilians[0] as string;
    expect(h.act(a, { type: 'pick', target: b })).toEqual({ ok: false, error: 'INVALID_TARGET' });
    expect(h.act(a, { type: 'pick', target: a })).toEqual({ ok: false, error: 'INVALID_TARGET' });
    expect(h.act(a, { type: 'lock' })).toEqual({ ok: false, error: 'NOT_ALLOWED' }); // nothing picked
    // A civilian may "suspect" anyone alive, traitors included, and lock it.
    h.do(civ, { type: 'pick', target: a });
    h.do(civ, { type: 'lock' });
    expect(h.state.phase.name).toBe('night');
    expect(h.state.dead).toEqual([]);
  });

  it('stops waiting for a traitor who has been away 15s', () => {
    const h = harness(9);
    h.continue();
    const [a, b] = h.traitors as [string, string];
    const victim = h.civilians[0] as string;
    h.input({ kind: 'presence', playerId: b, online: false });
    h.lockCivilians();
    h.do(a, { type: 'pick', target: victim });
    h.do(a, { type: 'lock' });
    expect(h.state.phase.name).toBe('night'); // b only just left
    expect(traitor.nextWakeup(h.state)).toBe(h.now + TRAITOR_AWAY_CUTOFF_MS);
    h.advance(TRAITOR_AWAY_CUTOFF_MS);
    expect(h.state.phase.name).toBe('morning');
    expect(h.state.victimId).toBe(victim);
  });

  it("doesn't wait for a civilian who is away", () => {
    const h = harness(5);
    h.continue();
    const [t] = h.traitors as [string];
    const [victim, away] = h.civilians as [string, string];
    h.input({ kind: 'presence', playerId: away, online: false });
    h.lockCivilians([away]);
    h.do(t, { type: 'pick', target: victim });
    h.do(t, { type: 'lock' });
    expect(h.state.phase.name).toBe('morning');
  });

  it('waits for the cap if every traitor is away', () => {
    const h = harness(5);
    h.continue();
    h.input({ kind: 'presence', playerId: h.traitors[0] as string, online: false });
    h.advance(TRAITOR_AWAY_CUTOFF_MS);
    expect(h.state.phase.name).toBe('night');
    h.advance(TRAITOR_NIGHT_MS);
    expect(h.state).toMatchObject({ victimId: null, phase: { name: 'morning' } });
  });

  it('keeps dead players out of the night', () => {
    const h = harness(6);
    h.continue();
    const victim = h.civilians[0] as string;
    h.kill(victim);
    h.continue(); // day
    h.voteOut('skip');
    h.continue(); // night 2
    expect(h.state.night?.[victim]).toBeUndefined();
    expect(h.act(victim, { type: 'pick', target: h.civilians[1] as string })).toEqual({ ok: false, error: 'NOT_ALLOWED' });
  });
});

describe('day', () => {
  it('runs morning → day → vote → reveal → next night, with host controls', () => {
    const h = harness(6);
    h.continue();
    h.advance(TRAITOR_NIGHT_MS);
    expect(h.act('p2', { type: 'continue' })).toEqual({ ok: false, error: 'NOT_HOST' });
    h.continue();
    expect(h.state.phase.name).toBe('day');
    expect(traitor.nextWakeup(h.state)).toBeNull(); // untimed
    expect(h.act('p2', { type: 'startVote' })).toEqual({ ok: false, error: 'NOT_HOST' });
    h.do(h.host, { type: 'startVote' });
    expect(h.state.phase).toMatchObject({ name: 'vote', deadline: h.now + TRAITOR_VOTE_MS });
    h.advance(TRAITOR_VOTE_MS);
    expect(h.state.phase.name).toBe('reveal');
    expect(h.state.dayResult).toMatchObject({ evictedId: null, reason: 'skip' });
    h.continue();
    expect(h.state).toMatchObject({ phase: { name: 'night' }, round: 2 });
  });

  it('evicts the player with the most votes; missing votes count as skip', () => {
    const h = harness(7); // 2 traitors, 5 civilians
    h.continue();
    h.advance(TRAITOR_NIGHT_MS);
    h.continue();
    const civ = h.civilians[0] as string;
    h.voteOut(civ);
    expect(h.state.dead).toContainEqual({ id: civ, how: 'evicted' });
    expect(h.state.phase.name).toBe('reveal');

    h.continue();
    h.advance(TRAITOR_NIGHT_MS);
    h.continue();
    h.do(h.host, { type: 'startVote' });
    const [x, y] = h.alive as [string, string];
    h.do(x, { type: 'vote', target: y });
    h.do(y, { type: 'vote', target: x });
    h.advance(TRAITOR_VOTE_MS);
    expect(h.state.dayResult).toMatchObject({ evictedId: null, reason: 'skip' }); // missing votes = skip
  });

  it('dead players cannot vote', () => {
    const h = harness(6);
    h.continue();
    const victim = h.civilians[0] as string;
    h.kill(victim);
    h.continue();
    h.do(h.host, { type: 'startVote' });
    expect(h.act(victim, { type: 'vote', target: 'skip' })).toEqual({ ok: false, error: 'NOT_ALLOWED' });
  });
});

describe('winning', () => {
  it('civilians win by voting out every traitor; the whole team scores', () => {
    const h = harness(6);
    h.continue();
    const victim = h.civilians[0] as string;
    h.kill(victim);
    h.continue();
    h.voteOut(h.traitors[0] as string);
    const result = traitor.result(h.state);
    expect(result).toMatchObject({ endedBy: 'game', headline: 'Civilians win!' });
    expect(result?.winners.sort()).toEqual(h.civilians.sort()); // the night-1 victim too
    expect(result?.scores.every((s) => s.points === 1)).toBe(true);
  });

  it('traitors win when they match the civilians, right after a night kill', () => {
    const h = harness(5); // 1 traitor, 4 civilians
    h.continue();
    h.kill(h.civilians[0] as string); // 1 v 3
    h.continue();
    h.voteOut(h.civilians[1] as string); // 1 v 2
    h.continue();
    h.kill(h.civilians[2] as string); // 1 v 1
    const result = traitor.result(h.state);
    expect(result).toMatchObject({ headline: 'The traitor wins!', winners: h.traitors });
    expect(result?.scores).toEqual([{ playerId: h.traitors[0], points: 3 }]);
  });

  it('host End game reveals every role with no winner', () => {
    const h = harness(5);
    h.continue();
    const result = traitor.abort(h.state);
    expect(result).toMatchObject({ endedBy: 'host', winners: [], scores: [] });
    expect(result.roles.filter((r) => r.role === 'Traitor')).toHaveLength(1);
  });
});

describe('views', () => {
  it('reveals roles of the dead only as the settings say', () => {
    const hidden = harness(6, { revealVictimRole: false, revealEvictedRole: false });
    hidden.continue();
    const victim = hidden.civilians[0] as string;
    hidden.kill(victim);
    const seen = traitor.getPlayerView(hidden.state, hidden.civilians[1] as string);
    expect(seen.players.find((p) => p.id === victim)).toMatchObject({ status: 'killed', revealedRole: null });
    expect(seen.victimId).toBe(victim);

    const shown = harness(6, { revealVictimRole: true });
    shown.continue();
    shown.kill(shown.civilians[0] as string);
    const view = traitor.getPlayerView(shown.state, shown.civilians[1] as string);
    expect(view.players.find((p) => p.id === shown.civilians[0])?.revealedRole).toBe('civilian');
  });

  it('shows traitors their team and live picks; civilians only their own pick', () => {
    const h = harness(9);
    h.continue();
    const [a, b] = h.traitors as [string, string];
    const civ = h.civilians[0] as string;
    h.do(a, { type: 'pick', target: civ });
    const tv = traitor.getPlayerView(h.state, b);
    if (!('fellowTraitors' in tv)) throw new Error('expected a traitor view');
    expect(tv.fellowTraitors).toEqual([a]);
    expect(tv.night?.team).toEqual([{ id: a, target: civ, locked: false }]);

    h.do(civ, { type: 'pick', target: a });
    const cv = traitor.getPlayerView(h.state, civ);
    expect(cv.you.role).toBe('civilian');
    expect(cv.night).toEqual({ options: expect.any(Array), mine: { target: a, locked: false } });
    expect(JSON.stringify(cv)).not.toContain('team');
  });
});
