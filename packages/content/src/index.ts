import { z } from 'zod';
import { GENRES, WORD_DIFFICULTIES, type GenreId, type WordDifficulty } from '@party/shared';
import animals from '../genres/animals.json' with { type: 'json' };
import bollywoodMovies from '../genres/bollywood-movies.json' with { type: 'json' };
import bollywoodSongs from '../genres/bollywood-songs.json' with { type: 'json' };
import food from '../genres/food.json' with { type: 'json' };
import fruitsVegetables from '../genres/fruits-vegetables.json' with { type: 'json' };
import hollywoodMovies from '../genres/hollywood-movies.json' with { type: 'json' };
import objects from '../genres/objects.json' with { type: 'json' };
import office from '../genres/office.json' with { type: 'json' };
import places from '../genres/places.json' with { type: 'json' };
import random from '../genres/random.json' with { type: 'json' };

export const MIN_WORDS_PER_DIFFICULTY = 30;

const wordList = z.array(z.string().trim().min(1).max(40)).min(MIN_WORDS_PER_DIFFICULTY);

const genreFileSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  easy: wordList,
  medium: wordList,
  hard: wordList,
});

export type GenreWords = Record<WordDifficulty, readonly string[]> & { id: GenreId; name: string };
export type WordBank = Readonly<Record<GenreId, GenreWords>>;

const RAW: unknown[] = [
  bollywoodMovies,
  bollywoodSongs,
  hollywoodMovies,
  fruitsVegetables,
  animals,
  food,
  places,
  objects,
  office,
  random,
];

/** Parse and cross-check every genre file. Throws at boot if content is broken. */
export function loadWordBank(): WordBank {
  const bank: Partial<Record<GenreId, GenreWords>> = {};
  for (const raw of RAW) {
    const file = genreFileSchema.parse(raw);
    const meta = GENRES.find((g) => g.id === file.id);
    if (!meta) throw new Error(`Unknown genre file: ${file.id}`);
    if (meta.name !== file.name) throw new Error(`Genre ${file.id} name mismatch: ${file.name} vs ${meta.name}`);
    const seen = new Set<string>();
    for (const difficulty of WORD_DIFFICULTIES) {
      for (const word of file[difficulty]) {
        const key = word.toLowerCase();
        if (seen.has(key)) throw new Error(`Duplicate word in ${file.id}: ${word}`);
        seen.add(key);
      }
    }
    bank[meta.id] = { id: meta.id, name: meta.name, easy: file.easy, medium: file.medium, hard: file.hard };
  }
  for (const g of GENRES) {
    if (!bank[g.id]) throw new Error(`Missing genre file: ${g.id}`);
  }
  return bank as WordBank;
}
