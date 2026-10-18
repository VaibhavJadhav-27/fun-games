import type { LiveVote, PlayerId, VoteTarget } from '@party/shared';

/** SPEC "Shared: voting", implemented once for Imposter and Traitor. Pure functions. */

export interface VoteState {
  /** Who may vote, and who may be voted for (seat order). */
  readonly eligible: readonly PlayerId[];
  readonly ballots: Readonly<Record<PlayerId, VoteTarget>>;
}

export type VoteOutcome = { kind: 'out'; id: PlayerId } | { kind: 'none'; reason: 'tie' | 'skip' };

export interface VoteTally {
  outcome: VoteOutcome;
  counts: { target: VoteTarget; count: number }[];
  ballots: { voter: PlayerId; target: VoteTarget }[];
}

export function openVote(eligible: readonly PlayerId[]): VoteState {
  return { eligible: [...eligible], ballots: {} };
}

export function castVote(
  vote: VoteState,
  voter: PlayerId,
  target: VoteTarget,
): VoteState | 'NOT_ALLOWED' | 'INVALID_TARGET' {
  if (!vote.eligible.includes(voter)) return 'NOT_ALLOWED';
  if (target !== 'skip' && (target === voter || !vote.eligible.includes(target))) return 'INVALID_TARGET';
  return { ...vote, ballots: { ...vote.ballots, [voter]: target } };
}

/** True once every eligible player who is online has voted. Away players count as skip. */
export function isComplete(vote: VoteState, isOnline: (id: PlayerId) => boolean): boolean {
  return vote.eligible.filter(isOnline).every((id) => id in vote.ballots);
}

function countBallots(vote: VoteState, missingAsSkip: boolean): { target: VoteTarget; count: number }[] {
  const counts = new Map<VoteTarget, number>(vote.eligible.map((id) => [id, 0]));
  counts.set('skip', 0);
  for (const voter of vote.eligible) {
    const target = vote.ballots[voter] ?? (missingAsSkip ? 'skip' : undefined);
    if (target !== undefined) counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  return [...counts].map(([target, count]) => ({ target, count }));
}

/** Live view while voting: counts per name, never who voted for whom. */
export function liveCounts(vote: VoteState, viewer: PlayerId): LiveVote {
  return {
    counts: countBallots(vote, false),
    voted: Object.keys(vote.ballots).length,
    total: vote.eligible.length,
    myVote: vote.ballots[viewer] ?? null,
    canVote: vote.eligible.includes(viewer),
  };
}

/** Close the vote. Most votes is evicted; a tie, or skip with at least as many, evicts nobody. */
export function tally(vote: VoteState): VoteTally {
  const counts = countBallots(vote, true);
  const skip = counts.find((c) => c.target === 'skip')?.count ?? 0;
  const candidates = counts.filter((c) => c.target !== 'skip');
  const top = Math.max(0, ...candidates.map((c) => c.count));
  const leaders = candidates.filter((c) => c.count === top);

  let outcome: VoteOutcome;
  if (top === 0 || skip >= top) outcome = { kind: 'none', reason: 'skip' };
  else if (leaders.length > 1) outcome = { kind: 'none', reason: 'tie' };
  else outcome = { kind: 'out', id: leaders[0]?.target as PlayerId };

  const ballots = vote.eligible
    .filter((voter) => voter in vote.ballots)
    .map((voter) => ({ voter, target: vote.ballots[voter] as VoteTarget }));
  return { outcome, counts, ballots };
}
