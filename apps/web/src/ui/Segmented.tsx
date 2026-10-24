/** A row of mutually exclusive options (radio group). */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; disabled?: boolean }[];
  value: T;
  onChange(v: T): void;
}) {
  return (
    <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-2xl bg-panel-2 p-1" role="radiogroup">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={`min-h-11 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 ${
            o.value === value ? 'bg-accent text-white' : 'text-fg active:bg-line'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
