import { describe, expect, it } from 'vitest';
import { pictionaryViewSchema, type PictionaryAction, type PictionaryView } from '@party/shared';
import { pickRandom } from '../../engine/rng';
import { pictionary } from './index';
import type { PictionaryState } from './state';
import { PictionaryHarness } from './testing';

/**
 * ARCHITECTURE §8, layer 4: play many random games and, at every step, check what each
 * player would receive against what they're allowed to know.
 */

function secretsCheck(state: PictionaryState, viewer: string, view: PictionaryView): string | null {
  const parsed = pictionaryViewSchema.safeParse(view);
  if (!parsed.success) return `schema: ${parsed.error.issues[0]?.path.join('.')}`;
  const raw = JSON.stringify(view);
  const drawer = viewer === state.drawerId;

  if (view.you.role !== (drawer ? 'drawer' : 'guesser')) return 'wrong role';
  if (view.drawerId !== state.drawerId) return 'wrong drawer';
  if (state.phase.name === 'drawing' && !drawer) {
    if ('word' in view) return 'guesser view has a word field';
    if (raw.includes(JSON.stringify(state.word))) return 'word reached a guesser while drawing';
    if (view.genre !== null && state.settings.difficulty !== 'easy') return 'guesser got a genre hint off Easy';
  }
  if (raw.includes('usedWords') || raw.includes('history') || raw.includes('queue')) return 'server bookkeeping leaked';
  return null;
}

function randomAction(h: PictionaryHarness, view: PictionaryView, id: string): PictionaryAction | null {
  const roll = h.rng();
  if (view.phase === 'drawing') {
    if (view.you.role === 'drawer' && roll < 0.3) return { type: 'skip' };
    return id === h.host && roll < 0.6 ? { type: 'guessed' } : null;
  }
  return id === h.host ? { type: 'next' } : null;
}

function play(players: number, seed: number): number {
  const difficulty = (['easy', 'medium', 'hard', 'mixed'] as const)[seed % 4] ?? 'mixed';
  const h = new PictionaryHarness(players, { difficulty }, seed);
  let rounds = 0;

  for (let step = 0; step < 200; step++) {
    for (const id of h.ids) {
      const problem = secretsCheck(h.state, id, pictionary.getPlayerView(h.state, id));
      if (problem) throw new Error(`seed ${seed}, step ${step}, viewer ${id}: ${problem}`);
    }

    const roll = h.rng();
    if (roll < 0.1) {
      const who = pickRandom(h.ids, h.rng);
      h.input({ kind: 'presence', playerId: who, online: h.rng() < 0.6 });
    } else {
      const actor = pickRandom(h.ids, h.rng);
      const action = randomAction(h, pictionary.getPlayerView(h.state, actor), actor);
      if (action && h.act(actor, action).ok && action.type === 'next') rounds++;
    }
  }
  return rounds;
}

describe('leak checker', () => {
  it('catches planted leaks (so a passing run means something)', () => {
    const h = new PictionaryHarness(4, { difficulty: 'medium' });
    const guesser = h.ids.find((id) => id !== h.drawer) as string;
    const view = pictionary.getPlayerView(h.state, guesser);
    expect(secretsCheck(h.state, guesser, view)).toBeNull();
    expect(secretsCheck(h.state, guesser, { ...view, word: h.state.word } as PictionaryView)).not.toBeNull();
    expect(secretsCheck(h.state, guesser, { ...view, genre: 'Animals' } as PictionaryView)).not.toBeNull();
  });
});

describe('pictionary leak check (random games)', () => {
  it('never shows the word to a guesser before the reveal', () => {
    let rounds = 0;
    for (let seed = 1; seed <= 200; seed++) rounds += play(3 + (seed % 10), seed);
    // Sanity: the simulation actually plays through rounds.
    expect(rounds).toBeGreaterThan(1000);
  }, 60_000);
});
