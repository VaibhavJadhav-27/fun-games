import { useState } from 'react';
import type { LiveVote, PlayerId, VoteTarget } from '@party/shared';
import { gameAction } from '../socket/actions';

interface Props {
  vote: LiveVote;
  me: PlayerId;
  nameOf(id: PlayerId): string;
}

/** Tap a name to vote (or change your vote). Counts update live on every screen. */
export function VotePanel({ vote, me, nameOf }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<VoteTarget | null>(null);

  async function cast(target: VoteTarget) {
    if (!vote.canVote || target === vote.myVote) return;
    setPending(target);
    const res = await gameAction({ type: 'vote', target });
    setPending(null);
    // A stale tap (the vote just closed) is expected; stay quiet about it.
    setError(res.ok || res.error.code === 'STALE_PHASE' || res.error.code === 'WRONG_PHASE' ? null : res.error.message);
  }

  const max = Math.max(1, ...vote.counts.map((c) => c.count));

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted">
        {vote.voted} of {vote.total} voted
        {!vote.canVote && ' · you are watching'}
      </p>
      <ul className="flex flex-col gap-2">
        {vote.counts.map(({ target, count }) => {
          const mine = vote.myVote === target;
          const isSelf = target === me;
          const label = target === 'skip' ? 'Skip' : nameOf(target);
          return (
            <li key={target}>
              <button
                type="button"
                onClick={() => cast(target)}
                disabled={!vote.canVote || isSelf || pending !== null}
                aria-pressed={mine}
                className={`relative flex min-h-14 w-full items-center justify-between gap-3 overflow-hidden rounded-2xl border px-4 text-left transition-colors disabled:cursor-default ${
                  mine ? 'border-accent bg-accent/15' : 'border-line bg-panel-2 enabled:active:bg-line'
                } ${target === 'skip' ? 'mt-2 border-dashed' : ''}`}
              >
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 bg-accent/10 transition-[width] duration-300"
                  style={{ width: `${(count / max) * 100}%` }}
                />
                <span className="relative truncate font-semibold">
                  {label}
                  {isSelf && <span className="font-normal text-muted"> (you)</span>}
                  {mine && <span className="ml-2 text-xs font-bold text-accent uppercase">Your vote</span>}
                </span>
                <span
                  className="relative min-w-10 rounded-full bg-panel px-3 py-1 text-center font-mono text-lg font-bold tabular-nums"
                  aria-label={`${count} vote${count === 1 ? '' : 's'}`}
                >
                  {count}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
