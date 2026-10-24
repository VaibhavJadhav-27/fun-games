import { describe, expect, it } from 'vitest';
import { traitorViewSchema, type TraitorAction, type TraitorView } from '@party/shared';
import { pickRandom } from '../../engine/rng';
import { traitor } from './index';
import { deathOf, isAlive, isTraitor, type TraitorState } from './state';
import { TraitorHarness } from './testing';

/**
 * ARCHITECTURE §8, layer 4: play many random games and, at every step, check what each
 * player would receive against what they're allowed to know.
 */

function secretsCheck(state: TraitorState, viewer: string, view: TraitorView): string | null {
  const parsed = traitorViewSchema.safeParse(view);
  if (!parsed.success) return `schema: ${parsed.error.issues[0]?.path.join('.')}`;
  const raw = JSON.stringify(view);

  if (isTraitor(state, viewer)) {
    if (view.you.role !== 'traitor' || !('fellowTraitors' in view)) return 'traitor not told their role';
    const expected = state.traitorIds.filter((id) => id !== viewer).sort();
    if (JSON.stringify([...view.fellowTraitors].sort()) !== JSON.stringify(expected)) return 'wrong fellow traitors';
    if (view.night && !isAlive(state, viewer)) return 'dead traitor sees night picks';
  } else {
    if (view.you.role !== 'civilian') return 'civilian told they are a traitor';
    if ('fellowTraitors' in view || raw.includes('fellowTraitors')) return 'civilian payload lists traitors';
    if (raw.includes('"team"')) return 'civilian payload has traitor night picks';
    if (view.night) {
      const own = state.night?.[viewer];
      if (!own || JSON.stringify(view.night.mine) !== JSON.stringify(own)) return 'civilian night pick is not their own';
    }
  }

  for (const p of view.players) {
    const how = deathOf(state, p.id);
    if (how === null && p.revealedRole !== null) return `role of living ${p.id} revealed`;
    const allowed = how === 'killed' ? state.settings.revealVictimRole : state.settings.revealEvictedRole;
    if (how !== null && !allowed && p.revealedRole !== null) return `role of ${p.id} revealed against settings`;
    if (p.revealedRole !== null && p.revealedRole !== (isTraitor(state, p.id) ? 'traitor' : 'civilian')) {
      return 'wrong revealed role';
    }
  }

  if (view.phase === 'vote' && raw.includes('ballots')) return 'ballots visible while voting';
  if (view.phase !== 'night' && view.night !== null) return 'night picks outside the night';
  return null;
}

function randomAction(h: TraitorHarness, view: TraitorView, id: string): TraitorAction | null {
  const roll = h.rng();
  switch (view.phase) {
    case 'roles':
    case 'morning':
    case 'reveal':
      return id === h.host && roll < 0.6 ? { type: 'continue' } : null;
    case 'day':
      return id === h.host && roll < 0.5 ? { type: 'startVote' } : null;
    case 'vote': {
      if (!view.vote?.canVote || view.vote.myVote !== null) return null;
      const targets = view.vote.counts.map((c) => c.target).filter((t) => t !== id);
      // Like a real group: most voters pile onto whoever is already leading.
      const leader = view.vote.counts
        .filter((c) => c.target !== 'skip' && c.target !== id && c.count > 0)
        .sort((x, y) => y.count - x.count)[0];
      return { type: 'vote', target: leader && roll < 0.75 ? leader.target : pickRandom(targets, h.rng) };
    }
    case 'night': {
      if (!view.night) return null;
      if (roll < 0.15) return { type: 'unlock' };
      // Traitors mostly follow the first teammate's pick so nights often end by agreement.
      const lead = 'fellowTraitors' in view ? view.night?.team.find((t) => t.target)?.target : undefined;
      if (view.night.mine.target && roll < 0.6) return { type: 'lock' };
      const target = lead && roll < 0.8 ? lead : pickRandom(view.night.options, h.rng);
      return { type: 'pick', target };
    }
    default:
      return null;
  }
}

function play(players: number, seed: number): boolean {
  const settings = { revealVictimRole: seed % 2 === 0, revealEvictedRole: seed % 3 !== 0 };
  const h = new TraitorHarness(players, settings, seed);
  const ids = h.state.players.map((p) => p.id);

  let checked: TraitorState | null = null;
  for (let step = 0; step < 2000 && !traitor.result(h.state); step++) {
    // Check every player's payload whenever the state changed.
    if (h.state !== checked) {
      for (const id of ids) {
        const problem = secretsCheck(h.state, id, traitor.getPlayerView(h.state, id));
        if (problem) throw new Error(`seed ${seed}, step ${step}, viewer ${id}: ${problem}`);
      }
      checked = h.state;
    }

    const roll = h.rng();
    if (roll < 0.06) {
      h.advance(16_000); // let away cutoffs and deadlines pass
    } else if (roll < 0.12) {
      h.input({ kind: 'presence', playerId: pickRandom(ids, h.rng), online: h.rng() < 0.6 });
    } else {
      // The host drives every untimed phase, so give them a fair share of turns.
      const actor = h.rng() < 0.3 ? h.host : pickRandom(ids, h.rng);
      const action = randomAction(h, traitor.getPlayerView(h.state, actor), actor);
      if (action) h.act(actor, action);
    }
  }
  return traitor.result(h.state) !== null;
}

describe('leak checker', () => {
  it('catches planted leaks (so a passing run means something)', () => {
    const h = new TraitorHarness(9);
    h.continue();
    const [a] = h.traitors as [string];
    const civ = h.civilians[0] as string;
    const tv = traitor.getPlayerView(h.state, a);
    const cv = traitor.getPlayerView(h.state, civ);
    expect(secretsCheck(h.state, a, tv)).toBeNull();
    expect(secretsCheck(h.state, civ, cv)).toBeNull();

    expect(secretsCheck(h.state, civ, { ...cv, fellowTraitors: [a] } as TraitorView)).not.toBeNull();
    const peek = { ...cv, players: cv.players.map((p) => ({ ...p, revealedRole: 'civilian' as const })) };
    expect(secretsCheck(h.state, civ, peek)).not.toBeNull();
    const nightPeek = { ...cv, night: { ...(cv.night as object), team: [] } } as unknown as TraitorView;
    expect(secretsCheck(h.state, civ, nightPeek)).not.toBeNull();
  });
});

describe('traitor leak check (random games)', () => {
  it('never shows civilians the traitors, night picks, hidden roles, or ballots mid-vote', () => {
    let finished = 0;
    for (let seed = 1; seed <= 200; seed++) {
      if (play(5 + (seed % 11), seed)) finished++; // 5..15 players
    }
    // Sanity: the simulation actually reaches the end of most games.
    expect(finished).toBeGreaterThan(180);
  }, 120_000);
});
