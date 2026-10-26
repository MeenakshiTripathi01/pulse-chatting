import { Spinner } from './Spinner.jsx';

const VARIANTS = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-600/60 focus-visible:outline-brand-600',
  secondary:
    'bg-white text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50 disabled:text-slate-400 focus-visible:outline-brand-600',
  ghost:
    'text-slate-700 hover:bg-slate-100 disabled:text-slate-400 focus-visible:outline-brand-600',
  danger:
    'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-600/60 focus-visible:outline-red-600',
};

export function Button({
  variant = 'primary',
  loading = false,
  disabled = false,
  className = '',
  children,
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
}
