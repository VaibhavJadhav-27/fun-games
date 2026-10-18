import { z } from 'zod';
import { playerIdSchema } from '../protocol/schemas';

/** Shared vote shapes used by Imposter and Traitor views. */

export const voteTargetSchema = z.union([playerIdSchema, z.literal('skip')]);
export type VoteTarget = z.infer<typeof voteTargetSchema>;

const countSchema = z.strictObject({ target: voteTargetSchema, count: z.number().int().min(0) });

/** While voting: counts per name only. Never who voted for whom. */
export const liveVoteSchema = z.strictObject({
  counts: z.array(countSchema),
  voted: z.number().int().min(0),
  total: z.number().int().min(0),
  /** The viewer's own current vote. */
  myVote: voteTargetSchema.nullable(),
  canVote: z.boolean(),
});
export type LiveVote = z.infer<typeof liveVoteSchema>;

/** After the vote closes: final counts, ballots, and who (if anyone) was evicted. */
export const voteResultSchema = z.strictObject({
  outcome: z.enum(['caught', 'innocent', 'nobody']),
  evictedId: playerIdSchema.nullable(),
  reason: z.enum(['tie', 'skip']).nullable(),
  counts: z.array(countSchema),
  ballots: z.array(z.strictObject({ voter: playerIdSchema, target: voteTargetSchema })),
});
export type VoteResult = z.infer<typeof voteResultSchema>;
