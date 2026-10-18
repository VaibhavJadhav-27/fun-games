import type { ReactNode } from 'react';

export function Card({ title, aside, children }: { title?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-line bg-panel p-4">
      {(title || aside) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}
