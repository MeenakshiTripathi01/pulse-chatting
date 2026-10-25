import { formatFullDateTime, formatMessageTime } from '../../lib/format.js';
import { Spinner } from '../ui/Spinner.jsx';

export function MessageBubble({ message, isOwn, onRetry }) {
  const isSending = message.status === 'sending';
  const isFailed = message.status === 'failed';

  return (
    <li className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`flex max-w-[85%] flex-col sm:max-w-[70%] ${isOwn ? 'items-end' : 'items-start'}`}
      >
        <div
          className={`rounded-2xl px-3.5 py-2 text-[0.9375rem] leading-relaxed break-words whitespace-pre-wrap ${
            isOwn
              ? `rounded-br-md text-white ${isFailed ? 'bg-red-700' : 'bg-brand-600'} ${isSending ? 'opacity-75' : ''}`
              : 'rounded-bl-md bg-white text-slate-900 ring-1 ring-slate-200'
          }`}
        >
          <span className="sr-only">{isOwn ? 'You said: ' : 'They said: '}</span>
          {message.content}
        </div>

        <div className="mt-1 flex items-center gap-1.5 px-1 text-xs text-slate-500">
          {isSending && (
            <>
              <Spinner className="size-3" />
              <span>Sending…</span>
            </>
          )}
          {isFailed && (
            <>
              <span className="text-red-700">Not sent. {message.error}</span>
              <button
                type="button"
                onClick={() => onRetry(message)}
                className="rounded font-medium text-brand-700 underline underline-offset-2 hover:text-brand-600 focus-visible:outline-2 focus-visible:outline-brand-600"
              >
                Retry
              </button>
            </>
          )}
          {!isSending && !isFailed && (
            <time dateTime={message.createdAt} title={formatFullDateTime(message.createdAt)}>
              {formatMessageTime(message.createdAt)}
            </time>
          )}
        </div>
      </div>
    </li>
  );
}
