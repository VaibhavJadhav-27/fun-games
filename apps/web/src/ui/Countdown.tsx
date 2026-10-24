import { useEffect, useState } from 'react';
import { serverNow } from '../socket/store';

/** Renders seconds left until a server deadline. Display only: the server decides. */
export function useSecondsLeft(deadline: number | null): number | null {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (deadline === null) return;
    const id = setInterval(() => setNow(serverNow()), 250);
    return () => clearInterval(id);
  }, [deadline]);
  if (deadline === null) return null;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function Countdown({ deadline, total }: { deadline: number | null; total: number }) {
  const left = useSecondsLeft(deadline);
  if (left === null) return null;
  const pct = Math.min(100, (left / total) * 100);
  const urgent = left <= 10;
  return (
    <div className="flex flex-col gap-1.5" role="timer" aria-live="off">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-muted">Time left</span>
        <span className={`font-mono text-2xl font-bold tabular-nums ${urgent ? 'text-bad' : 'text-fg'}`}>{left}s</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-panel-2">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${urgent ? 'bg-bad' : 'bg-accent'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
