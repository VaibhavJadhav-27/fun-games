import { describe, expect, it } from 'vitest';
import { loadWordBank } from '@party/content';
import { seededRng, shuffle } from './rng';
import { isCloseGuess, isCorrectGuess, normalizeGuess, pickWords } from './words';

const bank = loadWordBank();

describe('pickWords', () => {
  it('picks distinct words from the requested genres and difficulty', () => {
    const words = pickWords(bank, ['animals', 'food'], 'easy', 20, seededRng(1));
    expect(new Set(words.map((w) => w.text)).size).toBe(20);
    for (const w of words) {
      expect(['animals', 'food']).toContain(w.genreId);
      expect(bank[w.genreId].easy).toContain(w.text);
    }
  });

  it('draws from every level for mixed', () => {
    const words = pickWords(bank, ['places'], 'mixed', 100, seededRng(2));
    const levels = new Set(
      words.map((w) => (['easy', 'medium', 'hard'] as const).find((l) => bank.places[l].includes(w.text))),
    );
    expect(levels).toEqual(new Set(['easy', 'medium', 'hard']));
  });

  it('skips excluded words and is deterministic per seed', () => {
    const exclude = new Set(bank.animals.easy.slice(0, 30).map(normalizeGuess));
    const a = pickWords(bank, ['animals'], 'easy', 3, seededRng(9), exclude);
    const b = pickWords(bank, ['animals'], 'easy', 3, seededRng(9), exclude);
    expect(a).toEqual(b);
    for (const w of a) expect(exclude.has(normalizeGuess(w.text))).toBe(false);
  });
});

describe('guess matching', () => {
  it('ignores case, spacing and punctuation', () => {
    expect(isCorrectGuess('  dilwale dulhania   le jayenge ', 'Dilwale Dulhania Le Jayenge')).toBe(true);
    expect(isCorrectGuess('biwi no 1', 'Biwi No. 1')).toBe(true);
    expect(isCorrectGuess('Spiderman', 'Spider-Man')).toBe(true);
    expect(isCorrectGuess('Mango', 'Apple')).toBe(false);
  });

  it('detects one-character-off guesses', () => {
    expect(isCloseGuess('mangoo', 'Mango')).toBe(true);
    expect(isCloseGuess('mang', 'Mango')).toBe(true);
    expect(isCloseGuess('mengo', 'Mango')).toBe(true);
    expect(isCloseGuess('mango', 'Mango')).toBe(false);
    expect(isCloseGuess('mxngx', 'Mango')).toBe(false);
  });
});

describe('shuffle', () => {
  it('keeps every element', () => {
    const items = [1, 2, 3, 4, 5, 6];
    expect(shuffle(items, seededRng(3)).sort()).toEqual(items);
  });
});
