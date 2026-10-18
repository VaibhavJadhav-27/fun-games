import { useState, type ReactNode } from 'react';

/**
 * Hold-to-reveal card so neighbours can't peek at your secret. Hidden by default;
 * shows while pressed (touch, mouse, or holding Space/Enter).
 */
export function RoleCard({ children, hint = 'Hold to see your role' }: { children: ReactNode; hint?: string }) {
  const [shown, setShown] = useState(false);
  const show = () => setShown(true);
  const hide = () => setShown(false);

  return (
    <button
      type="button"
      onPointerDown={show}
      onPointerUp={hide}
      onPointerLeave={hide}
      onPointerCancel={hide}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') show();
      }}
      onKeyUp={hide}
      onBlur={hide}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={shown ? 'Your role (release to hide)' : hint}
      className={`flex min-h-40 w-full touch-none flex-col items-center justify-center gap-2 rounded-3xl border-2 p-6 text-center select-none transition-colors ${
        shown ? 'border-accent bg-accent/10' : 'border-dashed border-line bg-panel active:bg-panel-2'
      }`}
    >
      {shown ? (
        children
      ) : (
        <>
          <span aria-hidden className="text-4xl">
            🔒
          </span>
          <span className="text-lg font-semibold">{hint}</span>
          <span className="text-sm text-muted">Keep it hidden from others</span>
        </>
      )}
    </button>
  );
}
