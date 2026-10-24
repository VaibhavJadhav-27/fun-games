import { describe, expect, it } from 'vitest';
import { castVote, isComplete, liveCounts, openVote, tally, type VoteState } from './voting';

const players = ['a', 'b', 'c', 'd'];

function cast(vote: VoteState, voter: string, target: string): VoteState {
  const next = castVote(vote, voter, target);
  if (typeof next === 'string') throw new Error(next);
  return next;
}

describe('voting', () => {
  it('rejects self-votes, outsiders and unknown targets', () => {
    const vote = openVote(players);
    expect(castVote(vote, 'a', 'a')).toBe('INVALID_TARGET');
    expect(castVote(vote, 'a', 'zz')).toBe('INVALID_TARGET');
    expect(castVote(vote, 'zz', 'a')).toBe('NOT_ALLOWED');
  });

  it('lets voters change their vote', () => {
    let vote = cast(openVote(players), 'a', 'b');
    vote = cast(vote, 'a', 'c');
    expect(vote.ballots).toEqual({ a: 'c' });
  });

  it('shows live counts but never who voted for whom', () => {
    let vote = cast(openVote(players), 'a', 'b');
    vote = cast(vote, 'c', 'b');
    vote = cast(vote, 'd', 'skip');
    const live = liveCounts(vote, 'a');
    expect(live.counts).toEqual([
      { target: 'a', count: 0 },
      { target: 'b', count: 2 },
      { target: 'c', count: 0 },
      { target: 'd', count: 0 },
      { target: 'skip', count: 1 },
    ]);
    expect(live).toMatchObject({ voted: 3, total: 4, myVote: 'b', canVote: true });
    expect(JSON.stringify(live)).not.toContain('ballots');
    expect(liveCounts(vote, 'b').myVote).toBeNull();
  });

  it('is complete when every online eligible player voted', () => {
    let vote = cast(openVote(players), 'a', 'b');
    vote = cast(vote, 'b', 'a');
    vote = cast(vote, 'c', 'a');
    expect(isComplete(vote, () => true)).toBe(false);
    expect(isComplete(vote, (id) => id !== 'd')).toBe(true);
  });

  it('evicts the single most-voted player', () => {
    let vote = cast(openVote(players), 'a', 'b');
    vote = cast(vote, 'c', 'b');
    vote = cast(vote, 'b', 'a');
    const result = tally(vote);
    expect(result.outcome).toEqual({ kind: 'out', id: 'b' });
    expect(result.ballots).toEqual([
      { voter: 'a', target: 'b' },
      { voter: 'b', target: 'a' },
      { voter: 'c', target: 'b' },
    ]);
  });

  it('evicts nobody on a tie', () => {
    let vote = cast(openVote(players), 'a', 'b');
    vote = cast(vote, 'b', 'a');
    vote = cast(vote, 'c', 'a');
    vote = cast(vote, 'd', 'b');
    expect(tally(vote).outcome).toEqual({ kind: 'none', reason: 'tie' });
  });

  it('counts missing votes as skip, and skip wins ties', () => {
    // b gets 2, skip gets 2 (one explicit, one missing): nobody.
    let vote = cast(openVote(players), 'a', 'b');
    vote = cast(vote, 'c', 'b');
    vote = cast(vote, 'd', 'skip');
    expect(tally(vote).outcome).toEqual({ kind: 'none', reason: 'skip' });
    expect(tally(openVote(players)).outcome).toEqual({ kind: 'none', reason: 'skip' });
  });
});
