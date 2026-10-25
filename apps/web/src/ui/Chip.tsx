/** A toggleable pill, for multi-select lists like genres. */
export function Chip({ on, onClick, children }: { on: boolean; onClick(): void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors ${
        on ? 'border-accent bg-accent text-white' : 'border-line bg-panel-2 text-fg active:bg-line'
      }`}
    >
      {children}
    </button>
  );
}
