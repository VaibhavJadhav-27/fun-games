import type { WordBank } from '@party/content';
import { WORD_DIFFICULTIES, type Difficulty, type GenreId, type WordDifficulty } from '@party/shared';
import { pickRandom, shuffle, type Rng } from './rng';

export interface PickedWord {
  text: string;
  genreId: GenreId;
}

/**
 * Pick `count` distinct words from the given genres and difficulty, skipping `exclude`.
 * Genres are weighted equally regardless of list length.
 */
export function pickWords(
  bank: WordBank,
  genres: readonly GenreId[],
  difficulty: Difficulty,
  count: number,
  rng: Rng,
  exclude: ReadonlySet<string> = new Set(),
): PickedWord[] {
  const levels: readonly WordDifficulty[] = difficulty === 'mixed' ? WORD_DIFFICULTIES : [difficulty];
  const pools = genres.map((genreId) => ({
    genreId,
    words: shuffle(
      levels.flatMap((level) => bank[genreId][level]).filter((w) => !exclude.has(normalizeGuess(w))),
      rng,
    ),
  }));

  const picked: PickedWord[] = [];
  const used = new Set<string>();
  while (picked.length < count) {
    const open = pools.filter((p) => p.words.length > 0);
    if (open.length === 0) throw new Error('pickWords: ran out of words');
    const pool = pickRandom(open, rng);
    const text = pool.words.pop() as string;
    const key = normalizeGuess(text);
    if (used.has(key)) continue;
    used.add(key);
    picked.push({ text, genreId: pool.genreId });
  }
  return picked;
}

/** Lowercase, trim, collapse whitespace, ignore punctuation. */
export function normalizeGuess(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isCorrectGuess(guess: string, word: string): boolean {
  return normalizeGuess(guess) === normalizeGuess(word);
}

/** One edit (insert, delete or substitute) away, after normalising. */
export function isCloseGuess(guess: string, word: string): boolean {
  const a = normalizeGuess(guess);
  const b = normalizeGuess(word);
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) === 1;
}
