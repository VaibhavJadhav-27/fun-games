import { z } from 'zod';

/** Genre metadata only. Word lists are server-only (packages/content). */
export const GENRES = [
  { id: 'bollywood-movies', name: 'Bollywood Movies' },
  { id: 'bollywood-songs', name: 'Bollywood Songs' },
  { id: 'hollywood-movies', name: 'Hollywood Movies' },
  { id: 'fruits-vegetables', name: 'Fruits & Vegetables' },
  { id: 'animals', name: 'Animals' },
  { id: 'food', name: 'Food & Drinks' },
  { id: 'places', name: 'Places' },
  { id: 'objects', name: 'Everyday Objects' },
  { id: 'office', name: 'Office' },
  { id: 'random', name: 'Random Words' },
] as const;

export type GenreId = (typeof GENRES)[number]['id'];
export const GENRE_IDS = GENRES.map((g) => g.id) as [GenreId, ...GenreId[]];
export const genreIdSchema = z.enum(GENRE_IDS);

export function genreName(id: GenreId): string {
  return GENRES.find((g) => g.id === id)?.name ?? id;
}

export const WORD_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type WordDifficulty = (typeof WORD_DIFFICULTIES)[number];

export const DIFFICULTIES = ['easy', 'medium', 'hard', 'mixed'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const difficultySchema = z.enum(DIFFICULTIES);
