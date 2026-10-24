import { z } from 'zod';
import { difficultySchema, type GenreId } from '../genres';
import { playerIdSchema } from '../protocol/schemas';
import { liveVoteSchema, voteResultSchema, voteTargetSchema } from './voting';

// ── Settings ────────────────────────────────────────────────────────────────

export const IMPOSTER_MAX_ROUNDS = 10;
export const IMPOSTER_TWO_IMPOSTERS_MIN_PLAYERS = 8;
export const IMPOSTER_VOTE_MS = 60_000;
export const IMPOSTER_GUESS_MS = 30_000;

export const CUSTOM_WORD_MAX = 30;

/** The genres offered for Imposter (movie and song titles are Pictionary-only). */
export const IMPOSTER_GENRES = [
  'fruits-vegetables',
  'animals',
  'objects',
  'places',
  'food',
  'office',
  'random',
] as const satisfies readonly GenreId[];
export type ImposterGenreId = (typeof IMPOSTER_GENRES)[number];

export const customWordSchema = z
  .string()
  .trim()
  .min(1, 'Enter a word')
  .max(CUSTOM_WORD_MAX, `Keep it under ${CUSTOM_WORD_MAX} characters`)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} '&-]*$/u, 'Use letters, numbers and spaces only');

const settingsFields = {
  /** Where the word comes from. With 'custom', the host types it and moderates instead of playing. */
  source: z.enum(['genres', 'custom']),
  genres: z
    .array(z.enum(IMPOSTER_GENRES))
    .min(1, 'Pick at least one genre')
    .max(IMPOSTER_GENRES.length)
    .refine((ids) => new Set(ids).size === ids.length, 'Duplicate genre'),
  difficulty: difficultySchema,
  imposters: z.union([z.literal(1), z.literal(2)]),
  maxRounds: z.number().int().min(1).max(IMPOSTER_MAX_ROUNDS),
};

/** Server-side settings. The custom word is secret: it never goes into RoomInfo. */
export const imposterSettingsSchema = z.strictObject({ ...settingsFields, customWord: customWordSchema.nullable() });
export type ImposterSettings = z.infer<typeof imposterSettingsSchema>;

/** What the host sends. Leaving out `customWord` keeps the current one; null clears it. */
export const imposterSettingsUpdateSchema = z.strictObject({
  ...settingsFields,
  customWord: customWordSchema.nullable().optional(),
});
export type ImposterSettingsUpdate = z.infer<typeof imposterSettingsUpdateSchema>;

/** The settings everyone in the room sees: the custom word is reduced to "is it set". */
export type ImposterPublicSettings = Omit<ImposterSettings, 'customWord'> & { customWordSet: boolean };

export const IMPOSTER_DEFAULT_GENRES: ImposterGenreId[] = ['food', 'places', 'animals', 'objects'];

export function imposterDefaultSettings(): ImposterSettings {
  return {
    source: 'genres',
    genres: [...IMPOSTER_DEFAULT_GENRES],
    difficulty: 'medium',
    imposters: 1,
    maxRounds: 3,
    customWord: null,
  };
}

// ── Actions ─────────────────────────────────────────────────────────────────

export const imposterActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('startVote') }),
  z.strictObject({ type: z.literal('vote'), target: voteTargetSchema }),
  z.strictObject({ type: z.literal('continue') }),
  z.strictObject({ type: z.literal('guess'), text: z.string().trim().min(1).max(60) }),
]);
export type ImposterAction = z.infer<typeof imposterActionSchema>;

// ── Views ───────────────────────────────────────────────────────────────────

export const IMPOSTER_PHASES = ['discussion', 'vote', 'result', 'lastGuess', 'over'] as const;
export type ImposterPhase = (typeof IMPOSTER_PHASES)[number];

const role = z.enum(['crewmate', 'imposter']);

const base = {
  game: z.literal('imposter'),
  phase: z.enum(IMPOSTER_PHASES),
  phaseSeq: z.number().int(),
  deadline: z.number().nullable(),
  round: z.number().int(),
  maxRounds: z.number().int(),
  players: z.array(
    z.strictObject({
      id: playerIdSchema,
      name: z.string(),
      evicted: z.boolean(),
      /** Only set once a player has been evicted (their role is revealed then). */
      revealedRole: role.nullable(),
    }),
  ),
  vote: liveVoteSchema.nullable(),
  result: voteResultSchema.nullable(),
  lastGuess: z
    .strictObject({
      by: playerIdSchema,
      status: z.enum(['pending', 'wrong', 'timeout']),
      text: z.string().nullable(),
    })
    .nullable(),
};

/**
 * Strict per-role views: the imposter variant has no `word` key at all, and the
 * crewmate variant has no `fellowImposters`. Any extra key fails validation.
 */
export const crewmateViewSchema = z.strictObject({
  ...base,
  you: z.strictObject({ id: playerIdSchema, role: z.literal('crewmate'), evicted: z.boolean() }),
  word: z.string(),
  /** Null for a custom word. */
  genre: z.string().nullable(),
});

export const imposterRoleViewSchema = z.strictObject({
  ...base,
  you: z.strictObject({ id: playerIdSchema, role: z.literal('imposter'), evicted: z.boolean() }),
  /** The hint: only on Easy with a genre word; null otherwise. */
  genre: z.string().nullable(),
  fellowImposters: z.array(playerIdSchema),
});

/** The host of a custom-word game: knows the word, runs the game, has no role and no vote. */
export const moderatorViewSchema = z.strictObject({
  ...base,
  you: z.strictObject({ id: playerIdSchema, role: z.literal('moderator') }),
  word: z.string(),
  genre: z.string().nullable(),
});

export const imposterViewSchema = z.union([crewmateViewSchema, imposterRoleViewSchema, moderatorViewSchema]);
export type ImposterView = z.infer<typeof imposterViewSchema>;
export type CrewmateView = z.infer<typeof crewmateViewSchema>;
export type ImposterRoleView = z.infer<typeof imposterRoleViewSchema>;
export type ModeratorView = z.infer<typeof moderatorViewSchema>;
