import { z } from 'zod';
import { GENRE_IDS, difficultySchema, genreIdSchema, type GenreId } from '../genres';
import { playerIdSchema } from '../protocol/schemas';

// ── Settings ────────────────────────────────────────────────────────────────

/**
 * Offline: drawing happens on paper and guesses are shouted out loud; phones only deal out
 * the word. Online (drawing on the phone) is coming soon.
 */
export const PICTIONARY_MODES = ['offline', 'online'] as const;
export type PictionaryMode = (typeof PICTIONARY_MODES)[number];

/** Pictionary offers every genre, including movie and song titles. */
export const PICTIONARY_GENRES = GENRE_IDS;

export const pictionarySettingsSchema = z.strictObject({
  mode: z.enum(PICTIONARY_MODES),
  genres: z
    .array(genreIdSchema)
    .min(1, 'Pick at least one genre')
    .max(GENRE_IDS.length)
    .refine((ids) => new Set(ids).size === ids.length, 'Duplicate genre'),
  difficulty: difficultySchema,
});
export type PictionarySettings = z.infer<typeof pictionarySettingsSchema>;

export const PICTIONARY_DEFAULT_GENRES: GenreId[] = [
  'bollywood-movies',
  'hollywood-movies',
  'fruits-vegetables',
  'animals',
  'objects',
  'food',
];

export function pictionaryDefaultSettings(): PictionarySettings {
  return { mode: 'offline', genres: [...PICTIONARY_DEFAULT_GENRES], difficulty: 'medium' };
}

// ── Actions ─────────────────────────────────────────────────────────────────

export const pictionaryActionSchema = z.discriminatedUnion('type', [
  /** Drawer: swap the word for a new one (same drawer). */
  z.strictObject({ type: z.literal('skip') }),
  /** Host: someone guessed it; reveal the word to everyone. */
  z.strictObject({ type: z.literal('guessed') }),
  /** Host: start the next round with a new drawer. */
  z.strictObject({ type: z.literal('next') }),
]);
export type PictionaryAction = z.infer<typeof pictionaryActionSchema>;

// ── Views ───────────────────────────────────────────────────────────────────

export const PICTIONARY_PHASES = ['drawing', 'reveal'] as const;
export type PictionaryPhase = (typeof PICTIONARY_PHASES)[number];

const base = {
  game: z.literal('pictionary'),
  phaseSeq: z.number().int(),
  deadline: z.null(),
  round: z.number().int(),
  players: z.array(z.strictObject({ id: playerIdSchema, name: z.string() })),
  drawerId: playerIdSchema,
};

/** While drawing, only the drawer has a `word` key. */
export const drawerViewSchema = z.strictObject({
  ...base,
  phase: z.literal('drawing'),
  you: z.strictObject({ id: playerIdSchema, role: z.literal('drawer') }),
  word: z.string(),
  genre: z.string(),
});

export const guesserViewSchema = z.strictObject({
  ...base,
  phase: z.literal('drawing'),
  you: z.strictObject({ id: playerIdSchema, role: z.literal('guesser') }),
  /** The hint: only on Easy; null otherwise. */
  genre: z.string().nullable(),
});

/** After the host marks it guessed, everyone sees the word. */
export const revealViewSchema = z.strictObject({
  ...base,
  phase: z.literal('reveal'),
  you: z.strictObject({ id: playerIdSchema, role: z.enum(['drawer', 'guesser']) }),
  word: z.string(),
  genre: z.string(),
});

export const pictionaryViewSchema = z.union([drawerViewSchema, guesserViewSchema, revealViewSchema]);
export type PictionaryView = z.infer<typeof pictionaryViewSchema>;
export type DrawerView = z.infer<typeof drawerViewSchema>;
export type GuesserView = z.infer<typeof guesserViewSchema>;
export type RevealView = z.infer<typeof revealViewSchema>;
