import { z } from 'zod';
import { GENRE_IDS, difficultySchema, genreIdSchema, type GenreId } from '../genres';
import { playerIdSchema } from '../protocol/schemas';

// ── Settings ────────────────────────────────────────────────────────────────

/**
 * Offline: drawing happens on paper and guesses are shouted out loud; phones only deal out
 * the word. Board: the drawer draws on their phone, everyone watches live, guesses can be
 * typed, and each round has a countdown. Online (turns, scores, hints) is coming soon.
 */
export const PICTIONARY_MODES = ['offline', 'board', 'online'] as const;
export type PictionaryMode = (typeof PICTIONARY_MODES)[number];

/** Board mode: seconds per round the host can pick. */
export const PICTIONARY_DRAW_SECONDS = [120, 150, 180] as const;
export type PictionaryDrawSeconds = (typeof PICTIONARY_DRAW_SECONDS)[number];
export const PICTIONARY_DEFAULT_DRAW_SECONDS: PictionaryDrawSeconds = 120;

export const PICTIONARY_GUESS_MAX_LENGTH = 60;

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
  /** Board mode only. Defaults so settings from an older client still parse. */
  drawSeconds: z.literal(PICTIONARY_DRAW_SECONDS).default(PICTIONARY_DEFAULT_DRAW_SECONDS),
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
  return {
    mode: 'offline',
    genres: [...PICTIONARY_DEFAULT_GENRES],
    difficulty: 'medium',
    drawSeconds: PICTIONARY_DEFAULT_DRAW_SECONDS,
  };
}

// ── Actions ─────────────────────────────────────────────────────────────────

export const pictionaryActionSchema = z.discriminatedUnion('type', [
  /** Drawer: swap the word for a new one (same drawer). */
  z.strictObject({ type: z.literal('skip') }),
  /** Host: someone guessed it; reveal the word to everyone. */
  z.strictObject({ type: z.literal('guessed') }),
  /** Host: nobody got it; reveal the word to everyone. */
  z.strictObject({ type: z.literal('giveUp') }),
  /** Host: start the next round with a new drawer. */
  z.strictObject({ type: z.literal('next') }),
  /** Board mode, guesser: a typed guess. The result comes back only in the sender's ack. */
  z.strictObject({ type: z.literal('guess'), text: z.string().trim().min(1).max(PICTIONARY_GUESS_MAX_LENGTH) }),
]);
export type PictionaryAction = z.infer<typeof pictionaryActionSchema>;

/** Ack data for a typed guess, sent to the guesser only. */
export interface PictionaryGuessReply {
  guess: 'wrong' | 'close' | 'correct';
}

// ── Stream (board mode strokes; public) ─────────────────────────────────────

/** Pen colours by index; the last index is the eraser. */
export const PICTIONARY_COLORS = 8;
export const PICTIONARY_ERASER = PICTIONARY_COLORS;
export const PICTIONARY_SIZES = 3;
/** Points are 0–1 normalised and quantised to this grid, so payloads stay small. */
export const PICTIONARY_GRID = 1000;
export const PICTIONARY_MAX_POINTS_PER_OP = 64;

const coord = z.number().int().min(0).max(PICTIONARY_GRID);
const strokeIdSchema = z.string().min(1).max(16);

export const pictionaryStreamOpSchema = z.discriminatedUnion('t', [
  /**
   * Part of a stroke. A long stroke is sent as several segments with the same id; each
   * segment repeats the previous segment's last point, so it can be drawn on its own.
   */
  z.strictObject({
    t: z.literal('seg'),
    id: strokeIdSchema,
    color: z.number().int().min(0).max(PICTIONARY_ERASER),
    size: z.number().int().min(0).max(PICTIONARY_SIZES - 1),
    pts: z.array(z.tuple([coord, coord])).min(1).max(PICTIONARY_MAX_POINTS_PER_OP),
  }),
  /** Remove every segment of a stroke. */
  z.strictObject({ t: z.literal('undo'), id: strokeIdSchema }),
  /** Wipe the board. */
  z.strictObject({ t: z.literal('clear') }),
]);
export type PictionaryStreamOp = z.infer<typeof pictionaryStreamOpSchema>;

// ── Views ───────────────────────────────────────────────────────────────────

export const PICTIONARY_PHASES = ['drawing', 'reveal'] as const;
export type PictionaryPhase = (typeof PICTIONARY_PHASES)[number];

const base = {
  game: z.literal('pictionary'),
  phaseSeq: z.number().int(),
  /** Board mode: when the round's time runs out (epoch ms). Null otherwise. */
  deadline: z.number().int().nullable(),
  mode: z.enum(['offline', 'board']),
  /** Board mode: the drawing's stream channel; changes with every new word. Null otherwise. */
  channelKey: z.string().nullable(),
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

/** After the host taps Guessed it or Nobody got it, everyone sees the word and who draws next. */
export const revealViewSchema = z.strictObject({
  ...base,
  phase: z.literal('reveal'),
  you: z.strictObject({ id: playerIdSchema, role: z.enum(['drawer', 'guesser']) }),
  word: z.string(),
  genre: z.string(),
  guessed: z.boolean(),
  /** Board mode: who typed the correct guess (null when the host tapped, or nobody got it). */
  guessedBy: playerIdSchema.nullable(),
  /** Board mode: the round ended because time ran out. */
  timeUp: z.boolean(),
  upNextId: playerIdSchema.nullable(),
});

export const pictionaryViewSchema = z.union([drawerViewSchema, guesserViewSchema, revealViewSchema]);
export type PictionaryView = z.infer<typeof pictionaryViewSchema>;
export type DrawerView = z.infer<typeof drawerViewSchema>;
export type GuesserView = z.infer<typeof guesserViewSchema>;
export type RevealView = z.infer<typeof revealViewSchema>;
