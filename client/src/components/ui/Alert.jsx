const TONES = {
  error: 'border-red-200 bg-red-50 text-red-800',
  info: 'border-brand-100 bg-brand-50 text-brand-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
};

export function Alert({ tone = 'error', children, action }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm ${TONES[tone]}`}
    >
      <div>{children}</div>
      {action}
    </div>
  );
}
