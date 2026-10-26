import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MESSAGE_MAX_LENGTH } from '../../lib/validation.js';
import { EmojiPicker } from './EmojiPicker.jsx';

const MAX_TEXTAREA_HEIGHT_PX = 160;

export function MessageComposer({
  onSend,
  onTyping,
  onStopTyping,
  disabled,
  disabledReason,
  recipientName,
  replyingTo = null,
  replyingToName = '',
  onCancelReply,
}) {
  const [value, setValue] = useState('');
  const textareaRef = useRef(null);
  const replyingToId = replyingTo?.id;

  // Choosing "Reply" on a message moves the cursor here, ready to type.
  useEffect(() => {
    if (replyingToId) textareaRef.current?.focus();
  }, [replyingToId]);
  // Where to put the caret after an emoji is inserted (applied once React has re-rendered).
  const pendingCaretRef = useRef(null);
  const onStopTypingRef = useRef(onStopTyping);
  useEffect(() => {
    onStopTypingRef.current = onStopTyping;
  });
  // Leaving the conversation (this component is keyed by conversation) ends our typing.
  useEffect(() => () => onStopTypingRef.current?.(), []);

  const trimmed = value.trim();
  const tooLong = trimmed.length > MESSAGE_MAX_LENGTH;
  const canSend = trimmed.length > 0 && !tooLong && !disabled;
  const showCounter = value.length > MESSAGE_MAX_LENGTH - 200;

  // Grow the textarea with its content, up to a maximum height.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`;
    if (pendingCaretRef.current !== null) {
      el.setSelectionRange(pendingCaretRef.current, pendingCaretRef.current);
      pendingCaretRef.current = null;
    }
  }, [value]);

  function updateValue(next) {
    setValue(next);
    if (next.trim()) onTyping?.();
    else onStopTyping?.();
  }

  /** Inserts at the caret (replacing any selection), so emojis can go mid-sentence. */
  function insertEmoji(emoji) {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    pendingCaretRef.current = start + emoji.length;
    updateValue(value.slice(0, start) + emoji + value.slice(end));
  }

  function submit() {
    if (!canSend) return;
    onSend(trimmed);
    onStopTyping?.();
    setValue('');
    textareaRef.current?.focus();
  }

  function handleKeyDown(event) {
    // Enter sends; Shift+Enter inserts a newline. Ignore Enter while an IME (e.g. for
    // Japanese or Chinese input) is composing text.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    } else if (event.key === 'Escape' && replyingTo) {
      event.preventDefault();
      onCancelReply?.();
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="border-t border-slate-200 bg-white px-3 py-3 sm:px-6"
    >
      {replyingTo && (
        <div
          role="status"
          className="mb-2 flex items-start gap-2 rounded-lg border-l-4 border-brand-500 bg-slate-100 py-1.5 pr-1.5 pl-3 text-sm"
        >
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-brand-700">Replying to {replyingToName}</p>
            <p className="truncate text-slate-700">{replyingTo.content}</p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            aria-label="Cancel reply"
            className="grid size-7 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-brand-600"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <EmojiPicker onSelect={insertEmoji} />
        <label htmlFor="message-input" className="sr-only">
          Message {recipientName}
        </label>
        <textarea
          id="message-input"
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(event) => updateValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Message ${recipientName}`}
          aria-describedby="composer-help"
          aria-invalid={tooLong || undefined}
          className="block max-h-40 min-h-11 flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-[0.9375rem] placeholder:text-slate-500 focus:border-brand-500 focus:outline-2 focus:outline-brand-500"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send message"
          className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-600 text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-5">
            <path d="M3.1 2.3a.75.75 0 0 0-.98.95l2.05 6.13H11a.75.75 0 0 1 0 1.5H4.17l-2.05 6.13a.75.75 0 0 0 .98.95l15-7.25a.75.75 0 0 0 0-1.36L3.1 2.3Z" />
          </svg>
        </button>
      </div>
      <div
        id="composer-help"
        className="mt-1.5 flex justify-between gap-2 px-1 text-xs text-slate-500"
      >
        <span>
          {disabled ? (
            <span className="text-amber-800">{disabledReason}</span>
          ) : (
            <>
              <kbd className="font-sans">Enter</kbd> to send ·{' '}
              <kbd className="font-sans">Shift</kbd> + <kbd className="font-sans">Enter</kbd> for a
              new line
            </>
          )}
        </span>
        {showCounter && (
          <span className={tooLong ? 'font-medium text-red-700' : ''}>
            {value.trim().length}/{MESSAGE_MAX_LENGTH}
          </span>
        )}
      </div>
    </form>
  );
}
