import { z } from 'zod';
import { playerIdSchema } from '../protocol/schemas';
import { liveVoteSchema, voteTargetSchema } from './voting';

// ── Settings ────────────────────────────────────────────────────────────────

export const TRAITOR_MIN_PLAYERS = 5;
export const TRAITOR_MAX_PLAYERS = 15;
export const TRAITOR_NIGHT_MS = 60_000;
export const TRAITOR_VOTE_MS = 60_000;
/** A traitor away this long stops counting towards the unanimous night lock. */
export const TRAITOR_AWAY_CUTOFF_MS = 15_000;

/** Default traitor count for a group size (SPEC §3.2). */
export function autoTraitorCount(players: number): number {
  if (players <= 6) return 1;
  if (players <= 11) return 2;
  return 3;
}

/** The host may choose 1 to floor((players − 1) / 3). */
export function maxTraitorCount(players: number): number {
  return Math.max(1, Math.floor((players - 1) / 3));
}

export const traitorSettingsSchema = z.strictObject({
  /** 'auto' follows the group size; a number is the host's override. */
  traitors: z.union([z.literal('auto'), z.number().int().min(1).max(maxTraitorCount(TRAITOR_MAX_PLAYERS))]),
  /** Reveal the night victim's role in the morning (they're always civilians). */
  revealVictimRole: z.boolean(),
  /** Reveal the role of whoever the day vote evicts. */
  revealEvictedRole: z.boolean(),
});
export type TraitorSettings = z.infer<typeof traitorSettingsSchema>;

export function traitorDefaultSettings(): TraitorSettings {
  return { traitors: 'auto', revealVictimRole: false, revealEvictedRole: true };
}

export function traitorCountFor(settings: TraitorSettings, players: number): number {
  return settings.traitors === 'auto' ? autoTraitorCount(players) : settings.traitors;
}

// ── Actions ─────────────────────────────────────────────────────────────────

export const traitorActionSchema = z.discriminatedUnion('type', [
  /** Host: roles → night, morning → day, reveal → next night. */
  z.strictObject({ type: z.literal('continue') }),
  z.strictObject({ type: z.literal('startVote') }),
  z.strictObject({ type: z.literal('vote'), target: voteTargetSchema }),
  /** Night. Traitors choose a victim; civilians choose a suspect (cover only, no effect). */
  z.strictObject({ type: z.literal('pick'), target: playerIdSchema }),
  z.strictObject({ type: z.literal('lock') }),
  z.strictObject({ type: z.literal('unlock') }),
]);
export type TraitorAction = z.infer<typeof traitorActionSchema>;

// ── Views ───────────────────────────────────────────────────────────────────

export const TRAITOR_PHASES = ['roles', 'night', 'morning', 'day', 'vote', 'reveal', 'over'] as const;
export type TraitorPhase = (typeof TRAITOR_PHASES)[number];

const role = z.enum(['traitor', 'civilian']);
export type TraitorRole = z.infer<typeof role>;

const countSchema = z.strictObject({ target: voteTargetSchema, count: z.number().int().min(0) });
const pickSchema = z.strictObject({ target: playerIdSchema.nullable(), locked: z.boolean() });

const base = {
  game: z.literal('traitor'),
  phase: z.enum(TRAITOR_PHASES),
  phaseSeq: z.number().int(),
  deadline: z.number().nullable(),
  /** Night number, from 1. */
  round: z.number().int(),
  players: z.array(
    z.strictObject({
      id: playerIdSchema,
      name: z.string(),
      status: z.enum(['alive', 'killed', 'evicted']),
      /** Only for dead players, and only if the matching reveal setting is on. */
      revealedRole: role.nullable(),
    }),
  ),
  /** Morning: who died in the night (null = nobody). */
  victimId: playerIdSchema.nullable(),
  vote: liveVoteSchema.nullable(),
  /** The day vote's result, during the reveal phase. Who voted for whom appears only here. */
  dayResult: z
    .strictObject({
      evictedId: playerIdSchema.nullable(),
      reason: z.enum(['tie', 'skip']).nullable(),
      counts: z.array(countSchema),
      ballots: z.array(z.strictObject({ voter: playerIdSchema, target: voteTargetSchema })),
    })
    .nullable(),
};

/**
 * Night for a civilian: the same list-and-lock screen as a traitor's, so nobody can tell
 * roles apart by watching phones. Their pick is a "suspect" and changes nothing.
 */
const civilianNight = z.strictObject({ options: z.array(playerIdSchema), mine: pickSchema });

/** Night for a living traitor: their own pick plus the other traitors' live picks. */
const traitorNight = z.strictObject({
  options: z.array(playerIdSchema),
  mine: pickSchema,
  team: z.array(z.strictObject({ id: playerIdSchema, target: playerIdSchema.nullable(), locked: z.boolean() })),
});

/** Civilians (alive or dead) never get traitor names, other players' roles, or night picks. */
export const civilianViewSchema = z.strictObject({
  ...base,
  you: z.strictObject({ id: playerIdSchema, role: z.literal('civilian'), alive: z.boolean() }),
  night: civilianNight.nullable(),
});

export const traitorRoleViewSchema = z.strictObject({
  ...base,
  you: z.strictObject({ id: playerIdSchema, role: z.literal('traitor'), alive: z.boolean() }),
  fellowTraitors: z.array(playerIdSchema),
  night: traitorNight.nullable(),
});

export const traitorViewSchema = z.union([civilianViewSchema, traitorRoleViewSchema]);
export type TraitorView = z.infer<typeof traitorViewSchema>;
export type CivilianView = z.infer<typeof civilianViewSchema>;
export type TraitorRoleView = z.infer<typeof traitorRoleViewSchema>;
