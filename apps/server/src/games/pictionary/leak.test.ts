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
  if (state.phase.name === 'drawing' && raw.includes('upNextId')) return 'up next shown while drawing';
  if (raw.includes('usedWords') || raw.includes('history') || raw.includes('queue')) return 'server bookkeeping leaked';
  if (view.mode !== state.settings.mode) return 'wrong mode';
  if (state.settings.mode === 'offline' && (view.deadline !== null || view.channelKey !== null)) return 'offline view has a timer or board';
  if (view.phase === 'reveal' && view.deadline !== null) return 'deadline shown at the reveal';
  return null;
}

/** Typed guesses are private to the guesser: no view may ever contain one. */
function guessCheck(view: PictionaryView, guesses: ReadonlySet<string>): string | null {
  const raw = JSON.stringify(view);
  for (const g of guesses) if (raw.includes(g)) return `typed guess "${g}" reached a view`;
  return null;
}

function randomAction(h: PictionaryHarness, view: PictionaryView, id: string, step: number): PictionaryAction | null {
  const roll = h.rng();
  if (view.phase === 'drawing') {
    if (view.you.role === 'drawer' && roll < 0.3) return { type: 'skip' };
    if (view.mode === 'board' && view.you.role === 'guesser' && roll < 0.6) {
      // Mostly wrong (unique marker text, so the check can look for it), sometimes right.
      return { type: 'guess', text: roll < 0.08 ? h.state.word : `zq guess ${step} ${id}` };
    }
    if (id !== h.host) return null;
    return roll < 0.5 ? { type: 'guessed' } : roll < 0.7 ? { type: 'giveUp' } : null;
  }
  return id === h.host ? { type: 'next' } : null;
}

function play(players: number, seed: number, mode: 'offline' | 'board' = 'offline'): number {
  const difficulty = (['easy', 'medium', 'hard', 'mixed'] as const)[seed % 4] ?? 'mixed';
  const h = new PictionaryHarness(players, { difficulty, mode }, seed);
  const guesses = new Set<string>();
  let rounds = 0;

  for (let step = 0; step < 200; step++) {
    for (const id of h.ids) {
      const view = pictionary.getPlayerView(h.state, id);
      const problem = secretsCheck(h.state, id, view) ?? guessCheck(view, guesses);
      if (problem) throw new Error(`seed ${seed}, step ${step}, viewer ${id}: ${problem}`);
    }

    const roll = h.rng();
    if (roll < 0.08) {
      // The clock moves on (sometimes past the deadline) and the scheduler ticks.
      h.advance(Math.floor(h.rng() * 150_000));
    } else if (roll < 0.15) {
      const who = pickRandom(h.ids, h.rng);
      h.input({ kind: 'presence', playerId: who, online: h.rng() < 0.6 });
    } else {
      const actor = pickRandom(h.ids, h.rng);
      const action = randomAction(h, pictionary.getPlayerView(h.state, actor), actor, step);
      if (!action) continue;
      const result = h.act(actor, action);
      if (action.type === 'guess' && action.text !== h.state.word) guesses.add(action.text);
      if (result.ok && 'reply' in result && result.reply && Object.keys(result.reply).join() !== 'guess') {
        throw new Error(`seed ${seed}: a guess reply carried more than the result`);
      }
      if (result.ok && action.type === 'next') rounds++;
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

  it('board mode: never shows the word early, and typed guesses never reach anyone', () => {
    let rounds = 0;
    for (let seed = 1; seed <= 200; seed++) rounds += play(3 + (seed % 10), seed, 'board');
    expect(rounds).toBeGreaterThan(500);
  }, 60_000);
});
