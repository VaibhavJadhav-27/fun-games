import { describe, expect, it } from 'vitest';
import { imposterViewSchema, type ImposterAction, type ImposterView } from '@party/shared';
import { pickRandom } from '../../engine/rng';
import { imposter } from './index';
import { isImposter, type ImposterState } from './state';
import { ImposterHarness } from './testing';

/**
 * ARCHITECTURE §8, layer 4: play many random games and, at every step, check what each
 * player would receive against what they're allowed to know.
 */

function secretsCheck(state: ImposterState, viewer: string, view: ImposterView): string | null {
  const parsed = imposterViewSchema.safeParse(view);
  if (!parsed.success) return `schema: ${parsed.error.issues[0]?.path.join('.')}`;
  const raw = JSON.stringify(view);

  if (isImposter(state, viewer)) {
    if (view.you.role !== 'imposter') return 'imposter told they are crew';
    if ('word' in view) return 'imposter view has a word field';
    if (raw.includes(JSON.stringify(state.word))) return 'secret word reached the imposter';
  } else {
    if (view.you.role !== 'crewmate') return 'crewmate told they are imposter';
    if ('fellowImposters' in view) return 'crewmate view lists imposters';
    if (raw.includes('fellowImposters')) return 'crewmate payload mentions fellowImposters';
  }

  for (const p of view.players) {
    if (!p.evicted && p.revealedRole !== null) return `role of ${p.id} revealed before eviction`;
    if (p.evicted && p.revealedRole !== (isImposter(state, p.id) ? 'imposter' : 'crewmate')) return 'wrong revealed role';
  }

  if (view.phase === 'vote') {
    if (raw.includes('ballots')) return 'ballots visible while voting';
    if (view.result !== null) return 'result visible while voting';
    if (!view.vote) return 'no live vote during vote phase';
  }
  return null;
}

function randomAction(h: ImposterHarness, view: ImposterView, id: string): ImposterAction | null {
  const roll = h.rng();
  switch (view.phase) {
    case 'discussion':
      return id === h.host && roll < 0.5 ? { type: 'startVote' } : null;
    case 'vote': {
      if (!view.vote?.canVote) return null;
      const targets = view.vote.counts.map((c) => c.target).filter((t) => t !== id);
      return { type: 'vote', target: pickRandom(targets, h.rng) };
    }
    case 'result':
      return id === h.host ? { type: 'continue' } : null;
    case 'lastGuess':
      if (view.lastGuess?.by !== id) return null;
      return { type: 'guess', text: roll < 0.3 ? h.state.word : 'not the word' };
    default:
      return null;
  }
}

function play(players: number, imposters: 1 | 2, seed: number): { steps: number; over: boolean } {
  const h = new ImposterHarness(players, { imposters, maxRounds: 4, difficulty: 'mixed' }, seed);
  const ids = h.state.players.map((p) => p.id);
  let steps = 0;

  for (; steps < 400 && !imposter.result(h.state); steps++) {
    for (const id of ids) {
      const problem = secretsCheck(h.state, id, imposter.getPlayerView(h.state, id));
      if (problem) throw new Error(`seed ${seed}, step ${steps}, viewer ${id}: ${problem}`);
    }

    const roll = h.rng();
    if (roll < 0.08) {
      h.advance(61_000); // let a deadline pass
    } else if (roll < 0.14) {
      const who = pickRandom(ids, h.rng);
      h.input({ kind: 'presence', playerId: who, online: h.rng() < 0.5 });
    } else {
      const actor = pickRandom(ids, h.rng);
      const action = randomAction(h, imposter.getPlayerView(h.state, actor), actor);
      if (action) h.act(actor, action);
    }
  }
  return { steps, over: imposter.result(h.state) !== null };
}

describe('leak checker', () => {
  it('catches planted leaks (so a passing run means something)', () => {
    const h = new ImposterHarness(4);
    const [imp] = h.imposters as [string];
    const crew = h.crew[0] as string;
    const impView = imposter.getPlayerView(h.state, imp);
    const crewView = imposter.getPlayerView(h.state, crew);
    expect(secretsCheck(h.state, imp, impView)).toBeNull();
    expect(secretsCheck(h.state, crew, crewView)).toBeNull();

    expect(secretsCheck(h.state, imp, { ...impView, word: h.state.word } as ImposterView)).not.toBeNull();
    expect(secretsCheck(h.state, crew, { ...crewView, fellowImposters: [imp] } as ImposterView)).not.toBeNull();
    const peek = { ...crewView, players: crewView.players.map((p) => ({ ...p, revealedRole: 'crewmate' as const })) };
    expect(secretsCheck(h.state, crew, peek)).not.toBeNull();
  });
});

describe('imposter leak check (random games)', () => {
  it('never reveals the word to imposters, imposters to crew, or ballots mid-vote', () => {
    let finished = 0;
    let games = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const players = 3 + (seed % 10); // 3..12
      const imposters = players >= 8 && seed % 2 === 0 ? 2 : 1;
      const { over } = play(players, imposters, seed);
      games++;
      if (over) finished++;
    }
    // Sanity: the simulation actually reaches the end of most games.
    expect(finished).toBeGreaterThan(games * 0.8);
  }, 60_000);
});
