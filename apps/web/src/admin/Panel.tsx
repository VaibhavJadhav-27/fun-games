import type { ReactNode } from 'react';

/** A sidebar section of the admin dashboard. */
export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-line bg-panel p-5">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}
