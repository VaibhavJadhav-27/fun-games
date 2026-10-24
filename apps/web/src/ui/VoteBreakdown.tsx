import type { PlayerId, VoteResult } from '@party/shared';

/** Any game's closed vote: final counts and who voted for whom. */
type ClosedVote = Pick<VoteResult, 'counts' | 'ballots'>;

/** Final counts and who voted for whom. Only shown after the vote closes. */
export function VoteBreakdown({ result, nameOf }: { result: ClosedVote; nameOf(id: PlayerId): string }) {
  const rows = result.counts
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((c) => ({
      target: c.target,
      count: c.count,
      voters: result.ballots.filter((b) => b.target === c.target).map((b) => nameOf(b.voter)),
    }));

  if (rows.length === 0) return <p className="text-sm text-muted">Nobody voted.</p>;

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.target} className="rounded-2xl bg-panel-2 px-4 py-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold">{r.target === 'skip' ? 'Skip / no vote' : nameOf(r.target)}</span>
            <span className="font-mono font-bold tabular-nums">{r.count}</span>
          </div>
          {r.voters.length > 0 && <p className="mt-0.5 text-sm text-muted">{r.voters.join(', ')}</p>}
        </li>
      ))}
    </ul>
  );
}
