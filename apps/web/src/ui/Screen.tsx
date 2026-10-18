import type { ReactNode } from 'react';
import { Link } from 'wouter';

/** Full-height centred message screen (loading, errors, ended sessions). */
export function MessageScreen({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
      <h1 className="text-2xl font-bold">{title}</h1>
      {body && <p className="max-w-xs text-muted">{body}</p>}
      {action ?? (
        <Link href="/" className="mt-2 font-semibold text-accent underline-offset-4 hover:underline">
          Back to start
        </Link>
      )}
    </main>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 py-10" role="status">
      <div className="size-10 animate-spin rounded-full border-4 border-line border-t-accent" />
      <p className="text-muted">{label}</p>
    </main>
  );
}
