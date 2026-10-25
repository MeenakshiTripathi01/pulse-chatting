import { Button } from './Button.jsx';
import { Logo } from './Logo.jsx';
import { Spinner } from './Spinner.jsx';

export function FullPageStatus({ message, error, onRetry }) {
  return (
    <main className="grid h-full place-items-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <Logo />
        {error ? (
          <>
            <p role="alert" className="text-sm text-slate-700">
              {error}
            </p>
            {onRetry && <Button onClick={onRetry}>Try again</Button>}
          </>
        ) : (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Spinner className="size-4" />
            <span role="status">{message}</span>
          </div>
        )}
      </div>
    </main>
  );
}
