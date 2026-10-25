import { useId } from 'react';

export function TextField({ label, error, hint, className = '', ...inputProps }) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error || hint;

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        className={`block w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-2 focus:outline-offset-0 ${
          error
            ? 'border-red-500 focus:outline-red-500'
            : 'border-slate-300 focus:border-brand-500 focus:outline-brand-500'
        }`}
        {...inputProps}
      />
      {message && (
        <p id={messageId} className={`mt-1.5 text-sm ${error ? 'text-red-700' : 'text-slate-500'}`}>
          {message}
        </p>
      )}
    </div>
  );
}
