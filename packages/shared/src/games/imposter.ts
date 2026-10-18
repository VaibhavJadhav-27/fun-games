import { z } from 'zod';
import { GENRES, difficultySchema, genreIdSchema, type GenreId } from '../genres';
import { playerIdSchema } from '../protocol/schemas';
import { liveVoteSchema, voteResultSchema, voteTargetSchema } from './voting';

// ── Settings ────────────────────────────────────────────────────────────────

export const IMPOSTER_MAX_ROUNDS = 10;
export const IMPOSTER_TWO_IMPOSTERS_MIN_PLAYERS = 8;
export const IMPOSTER_VOTE_MS = 60_000;
export const IMPOSTER_GUESS_MS = 30_000;

export const imposterSettingsSchema = z.strictObject({
  genres: z
    .array(genreIdSchema)
    .min(1, 'Pick at least one genre')
    .max(GENRES.length)
    .refine((ids) => new Set(ids).size === ids.length, 'Duplicate genre'),
  difficulty: difficultySchema,
  imposters: z.union([z.literal(1), z.literal(2)]),
  maxRounds: z.number().int().min(1).max(IMPOSTER_MAX_ROUNDS),
});
export type ImposterSettings = z.infer<typeof imposterSettingsSchema>;

export const IMPOSTER_DEFAULT_GENRES: GenreId[] = ['bollywood-movies', 'food', 'places', 'animals'];

export function imposterDefaultSettings(): ImposterSettings {
  return { genres: [...IMPOSTER_DEFAULT_GENRES], difficulty: 'medium', imposters: 1, maxRounds: 3 };
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
  genre: z.string(),
});

export const imposterRoleViewSchema = z.strictObject({
  ...base,
  you: z.strictObject({ id: playerIdSchema, role: z.literal('imposter'), evicted: z.boolean() }),
  genre: z.string(),
  fellowImposters: z.array(playerIdSchema),
});

export const imposterViewSchema = z.union([crewmateViewSchema, imposterRoleViewSchema]);
export type ImposterView = z.infer<typeof imposterViewSchema>;
export type CrewmateView = z.infer<typeof crewmateViewSchema>;
export type ImposterRoleView = z.infer<typeof imposterRoleViewSchema>;
