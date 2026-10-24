import { describe, expect, it } from 'vitest';
import { GENRES, WORD_DIFFICULTIES } from '@party/shared';
import { MIN_WORDS_PER_DIFFICULTY, loadWordBank } from './index';

describe('word bank', () => {
  const bank = loadWordBank();

  it('has every genre with enough words per difficulty', () => {
    for (const g of GENRES) {
      const genre = bank[g.id];
      let total = 0;
      for (const d of WORD_DIFFICULTIES) {
        expect(genre[d].length, `${g.id}/${d}`).toBeGreaterThanOrEqual(MIN_WORDS_PER_DIFFICULTY);
        total += genre[d].length;
      }
      expect(total, g.id).toBeGreaterThanOrEqual(100);
    }
  });

  it('has no leading/trailing whitespace or empty words', () => {
    for (const g of GENRES) {
      for (const d of WORD_DIFFICULTIES) {
        for (const w of bank[g.id][d]) expect(w).toBe(w.trim());
      }
    }
  });
});
