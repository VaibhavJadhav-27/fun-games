import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-white active:bg-accent-strong disabled:bg-panel-2 disabled:text-muted',
  secondary: 'bg-panel-2 text-white border border-line active:bg-line disabled:text-muted',
  ghost: 'bg-transparent text-muted active:text-white disabled:opacity-50',
  danger: 'bg-transparent text-bad border border-bad/40 active:bg-bad/10 disabled:opacity-50',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  block?: boolean;
  busy?: boolean;
}

export function Button({ variant = 'primary', block, busy, className = '', children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      className={`min-h-12 rounded-2xl px-5 text-base font-semibold transition-colors disabled:cursor-not-allowed ${
        block ? 'w-full' : ''
      } ${VARIANTS[variant]} ${className}`}
    >
      {busy ? 'Please wait…' : children}
    </button>
  );
}
