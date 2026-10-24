import { useId } from 'react';

/** A labelled on/off switch row. */
export function Toggle({
  label,
  hint,
  on,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  on: boolean;
  disabled?: boolean;
  onChange(next: boolean): void;
}) {
  const hintId = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && (
          <p id={hintId} className="text-xs text-muted">
            {hint}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        aria-describedby={hint ? hintId : undefined}
        disabled={disabled}
        onClick={() => onChange(!on)}
        className={`relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-accent' : 'bg-line'}`}
      >
        <span
          className={`absolute top-1 size-6 rounded-full bg-white shadow-sm transition-[left] motion-reduce:transition-none ${
            on ? 'left-7' : 'left-1'
          }`}
        />
      </button>
    </div>
  );
}
