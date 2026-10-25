import { Spinner } from '../ui/Spinner.jsx';

const MESSAGES = {
  connecting: 'Connecting to chat…',
  reconnecting: 'Connection lost. Reconnecting…',
  offline: "You're offline. Messages can't be sent until you reconnect.",
};

/** Reflects the real Socket.IO connection state; renders nothing while connected. */
export function ConnectionBanner({ connection }) {
  const message = MESSAGES[connection];
  if (!message) return null;

  return (
    <div
      role="status"
      className={`flex items-center justify-center gap-2 px-4 py-1.5 text-sm ${
        connection === 'connecting'
          ? 'bg-slate-200 text-slate-700'
          : 'bg-amber-100 text-amber-900'
      }`}
    >
      {connection !== 'offline' && <Spinner className="size-3.5" />}
      {message}
    </div>
  );
}
