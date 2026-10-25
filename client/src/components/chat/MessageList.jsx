import { Fragment, useEffect, useLayoutEffect, useRef } from 'react';
import { formatDayLabel, isSameDay } from '../../lib/format.js';
import { Alert } from '../ui/Alert.jsx';
import { Button } from '../ui/Button.jsx';
import { MessageBubble } from './MessageBubble.jsx';

const NEAR_BOTTOM_PX = 120;

export function MessageList({ conversationId, thread, currentUserId, onLoadOlder, onRetry }) {
  const containerRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const distanceFromBottomRef = useRef(null);

  const { messages } = thread;
  const firstId = messages[0]?.id;
  const lastId = messages.at(-1)?.id;
  const lastIsOwn = messages.at(-1)?.senderId === currentUserId;

  function handleScroll() {
    const el = containerRef.current;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  }

  function handleLoadOlder() {
    const el = containerRef.current;
    distanceFromBottomRef.current = el.scrollHeight - el.scrollTop;
    onLoadOlder();
  }

  // When older messages are added above, keep the user's view anchored where it was.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (el && distanceFromBottomRef.current !== null) {
      el.scrollTop = el.scrollHeight - distanceFromBottomRef.current;
      distanceFromBottomRef.current = null;
    }
  }, [firstId]);

  // Jump to the newest message when a conversation opens.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    isNearBottomRef.current = true;
  }, [conversationId]);

  // Follow new messages if the user is already at the bottom or just sent one; don't yank
  // them down while they are reading older history.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !lastId) return;
    if (isNearBottomRef.current || lastIsOwn) {
      el.scrollTop = el.scrollHeight;
    }
  }, [lastId, lastIsOwn]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6"
    >
      {thread.hasMore && (
        <div className="mb-4 flex justify-center">
          {thread.olderStatus === 'error' ? (
            <Alert
              action={
                <Button variant="secondary" className="px-3 py-1.5" onClick={handleLoadOlder}>
                  Retry
                </Button>
              }
            >
              {thread.olderError}
            </Alert>
          ) : (
            <Button
              variant="secondary"
              className="px-3 py-1.5"
              loading={thread.olderStatus === 'loading'}
              onClick={handleLoadOlder}
            >
              Load older messages
            </Button>
          )}
        </div>
      )}

      <ol role="log" aria-label="Messages" aria-live="polite" className="space-y-2">
        {messages.map((message, index) => {
          const previous = messages[index - 1];
          const showDay = !previous || !isSameDay(previous.createdAt, message.createdAt);
          return (
            <Fragment key={message.id}>
              {showDay && (
                <li className="flex justify-center py-2" aria-hidden="true">
                  <span className="rounded-full bg-slate-200/70 px-3 py-0.5 text-xs font-medium text-slate-600">
                    {formatDayLabel(message.createdAt)}
                  </span>
                </li>
              )}
              <MessageBubble
                message={message}
                isOwn={message.senderId === currentUserId}
                onRetry={onRetry}
              />
            </Fragment>
          );
        })}
      </ol>
    </div>
  );
}
