import { formatFullDateTime, formatMessageTime } from '../../lib/format.js';
import { Spinner } from '../ui/Spinner.jsx';

const DELETED_TEXT = 'This message was deleted';

const actionButtonClass =
  'grid size-8 place-items-center rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-brand-600';

const replyIcon = (
  <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4">
    <path
      fillRule="evenodd"
      d="M7.8 4.2a.75.75 0 0 1 0 1.06L5.06 8h6.69A5.25 5.25 0 0 1 17 13.25v1a.75.75 0 0 1-1.5 0v-1a3.75 3.75 0 0 0-3.75-3.75H5.06l2.74 2.74a.75.75 0 1 1-1.06 1.06l-4.02-4.02a.75.75 0 0 1 0-1.06L6.74 4.2a.75.75 0 0 1 1.06 0Z"
      clipRule="evenodd"
    />
  </svg>
);

const trashIcon = (
  <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4">
    <path
      fillRule="evenodd"
      d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.44c-.8.08-1.58.17-2.36.29a.75.75 0 0 0 .22 1.48l.15-.02.83 10.36A2.75 2.75 0 0 0 7.58 19h4.84a2.75 2.75 0 0 0 2.74-2.7l.83-10.36.15.02a.75.75 0 1 0 .22-1.48c-.78-.12-1.57-.21-2.36-.29v-.44A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.67.03 2.5.08v-.33c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.33C8.33 4.03 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z"
      clipRule="evenodd"
    />
  </svg>
);

function bubbleTone({ isOwn, isDeleted, isFailed, isSending }) {
  if (isDeleted) return 'bg-white text-slate-500 italic ring-1 ring-slate-200';
  if (!isOwn) return 'bg-white text-slate-900 ring-1 ring-slate-200';
  return `text-white ${isFailed ? 'bg-red-700' : 'bg-brand-600'} ${isSending ? 'opacity-75' : ''}`;
}

/** The quoted message shown at the top of a reply. */
function ReplyQuote({ replyTo, isOwn, senderLabel }) {
  return (
    <div
      className={`mb-1.5 rounded-lg border-l-4 px-2.5 py-1.5 text-sm ${
        isOwn
          ? 'border-white/70 bg-white/15 text-white/90'
          : 'border-brand-500 bg-slate-100 text-slate-700'
      }`}
    >
      <span className="sr-only">In reply to </span>
      <span className="block text-xs font-semibold">{senderLabel}</span>
      <span className={`line-clamp-2 ${replyTo.deleted ? 'italic' : ''}`}>
        {replyTo.deleted ? DELETED_TEXT : replyTo.content}
      </span>
    </div>
  );
}

export function MessageBubble({
  message,
  isOwn,
  currentUserId,
  otherName,
  onRetry,
  onReply,
  onDelete,
}) {
  const isSending = message.status === 'sending';
  const isFailed = message.status === 'failed';
  const isDeleted = Boolean(message.deleted);
  const canAct = !isSending && !isFailed && !isDeleted;
  const replySender = message.replyTo?.senderId === currentUserId ? 'You' : otherName;

  return (
    <li className={`group flex items-center gap-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`flex max-w-[85%] flex-col sm:max-w-[70%] ${isOwn ? 'items-end' : 'items-start'}`}
      >
        <div
          className={`rounded-2xl px-3.5 py-2 text-[0.9375rem] leading-relaxed break-words whitespace-pre-wrap ${
            isOwn ? 'rounded-br-md' : 'rounded-bl-md'
          } ${bubbleTone({ isOwn, isDeleted, isFailed, isSending })}`}
        >
          {message.replyTo && !isDeleted && (
            <ReplyQuote replyTo={message.replyTo} isOwn={isOwn} senderLabel={replySender} />
          )}
          <span className="sr-only">{isOwn ? 'You said: ' : 'They said: '}</span>
          {isDeleted ? DELETED_TEXT : message.content}
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

      {canAct && (
        <div
          className={`mb-5 flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100 ${
            isOwn ? 'order-first flex-row-reverse' : ''
          }`}
        >
          <button
            type="button"
            onClick={() => onReply(message)}
            aria-label="Reply"
            title="Reply"
            className={actionButtonClass}
          >
            {replyIcon}
          </button>
          {isOwn && (
            <button
              type="button"
              onClick={() => onDelete(message)}
              aria-label="Delete message"
              title="Delete message"
              className={`${actionButtonClass} hover:text-red-700`}
            >
              {trashIcon}
            </button>
          )}
        </div>
      )}
    </li>
  );
}
