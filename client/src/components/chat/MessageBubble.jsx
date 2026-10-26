import { useEffect, useRef, useState } from 'react';
import { formatFullDateTime, formatMessageTime } from '../../lib/format.js';
import { Spinner } from '../ui/Spinner.jsx';

const DELETED_TEXT = 'This message was deleted';
// How far a message must be dragged to the right to start a reply, and how far it can move.
const SWIPE_TRIGGER_PX = 60;
const SWIPE_MAX_PX = 80;
// Movement below this is still treated as a click (fingers and mice jitter slightly).
const DRAG_SLOP_PX = 8;

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

/**
 * Swipe a message to the right to reply to it; click (or press Enter on) one of your own
 * messages for the delete option. Keyboard users can press the right arrow key to reply.
 */
export function MessageBubble({
  message,
  isOwn,
  currentUserId,
  otherName,
  hintId,
  onRetry,
  onReply,
  onDelete,
}) {
  const isSending = message.status === 'sending';
  const isFailed = message.status === 'failed';
  const isDeleted = Boolean(message.deleted);
  const canAct = !isSending && !isFailed && !isDeleted;
  const canDelete = canAct && isOwn;
  const replySender = message.replyTo?.senderId === currentUserId ? 'You' : otherName;

  const [dragX, setDragX] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  // { pointerId, startX, startY, swiping, moved } while a pointer is down on the bubble.
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);
  const bubbleRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    menuRef.current?.querySelector('button')?.focus();
    const handlePointerDown = (event) => {
      if (!menuRef.current?.contains(event.target) && !bubbleRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [menuOpen]);

  function handlePointerDown(event) {
    if (!canAct || event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      swiping: false,
      moved: false,
    };
  }

  function handlePointerMove(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;

    if (!drag.swiping) {
      if (Math.abs(dx) < DRAG_SLOP_PX && Math.abs(dy) < DRAG_SLOP_PX) return;
      drag.moved = true;
      // Only a mostly-horizontal drag to the right is a swipe; anything else (like scrolling)
      // is left alone.
      if (dx <= 0 || Math.abs(dx) < Math.abs(dy)) {
        dragRef.current = null;
        suppressClickRef.current = true;
        return;
      }
      drag.swiping = true;
      window.getSelection?.()?.removeAllRanges();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Capture is a nicety; without it the swipe ends if the pointer leaves the bubble.
      }
    }
    setDragX(Math.min(Math.max(dx, 0), SWIPE_MAX_PX));
  }

  function finishDrag(event, { cancelled = false } = {}) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (drag.moved) suppressClickRef.current = true;
    if (drag.swiping && !cancelled && event.clientX - drag.startX >= SWIPE_TRIGGER_PX) {
      onReply(message);
    }
    setDragX(0);
  }

  function handleClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (canDelete) setMenuOpen((open) => !open);
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      onReply(message);
    } else if (canDelete && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      setMenuOpen((open) => !open);
    } else if (event.key === 'Escape' && menuOpen) {
      setMenuOpen(false);
    }
  }

  function handleMenuKeyDown(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      setMenuOpen(false);
      bubbleRef.current?.focus();
    }
  }

  const isDragging = dragX > 0;

  return (
    <li className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`relative flex max-w-[85%] flex-col sm:max-w-[70%] ${isOwn ? 'items-end' : 'items-start'} ${
          isDragging ? '' : 'transition-transform duration-200'
        }`}
        style={isDragging ? { transform: `translateX(${dragX}px)` } : undefined}
      >
        {canAct && (
          <span
            aria-hidden="true"
            className="absolute top-1/2 right-full mr-3 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-slate-200 text-slate-600"
            style={{ opacity: Math.min(dragX / SWIPE_TRIGGER_PX, 1) }}
          >
            {replyIcon}
          </span>
        )}

        <div
          ref={bubbleRef}
          role={canDelete ? 'button' : undefined}
          tabIndex={canAct ? 0 : undefined}
          aria-haspopup={canDelete ? 'menu' : undefined}
          aria-expanded={canDelete ? menuOpen : undefined}
          aria-describedby={canAct ? hintId : undefined}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={(event) => finishDrag(event)}
          onPointerLeave={(event) => finishDrag(event)}
          onPointerCancel={(event) => finishDrag(event, { cancelled: true })}
          onClick={handleClick}
          onKeyDown={canAct ? handleKeyDown : undefined}
          className={`touch-pan-y rounded-2xl px-3.5 py-2 text-[0.9375rem] leading-relaxed break-words whitespace-pre-wrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
            isOwn ? 'rounded-br-md' : 'rounded-bl-md'
          } ${canDelete ? 'cursor-pointer' : ''} ${isDragging ? 'select-none' : ''} ${bubbleTone({
            isOwn,
            isDeleted,
            isFailed,
            isSending,
          })}`}
        >
          {message.replyTo && !isDeleted && (
            <ReplyQuote replyTo={message.replyTo} isOwn={isOwn} senderLabel={replySender} />
          )}
          <span className="sr-only">{isOwn ? 'You said: ' : 'They said: '}</span>
          {isDeleted ? DELETED_TEXT : message.content}
        </div>

        {menuOpen && (
          <div
            ref={menuRef}
            role="menu"
            aria-label="Message options"
            onKeyDown={handleMenuKeyDown}
            className={`absolute top-full z-10 mt-1 min-w-44 rounded-xl bg-white p-1 shadow-lg ring-1 ring-slate-200 ${
              isOwn ? 'right-0' : 'left-0'
            }`}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onDelete(message);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-600"
            >
              {trashIcon}
              Delete message
            </button>
          </div>
        )}

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
