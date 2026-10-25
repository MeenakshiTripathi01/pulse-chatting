import { Link } from 'react-router';
import {
  formatConversationTime,
  formatFullDateTime,
  getOtherParticipant,
} from '../../lib/format.js';
import { Alert } from '../ui/Alert.jsx';
import { Avatar } from '../ui/Avatar.jsx';
import { Button } from '../ui/Button.jsx';
import { EmptyState } from './EmptyState.jsx';

function ListSkeleton() {
  return (
    <ul aria-hidden="true" className="space-y-1 p-2">
      {[0, 1, 2, 3].map((key) => (
        <li key={key} className="flex items-center gap-3 rounded-lg px-3 py-3">
          <span className="size-10 animate-pulse rounded-full bg-slate-200" />
          <span className="flex-1 space-y-2">
            <span className="block h-3 w-1/2 animate-pulse rounded bg-slate-200" />
            <span className="block h-3 w-3/4 animate-pulse rounded bg-slate-100" />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ConversationList({
  conversations,
  currentUserId,
  activeConversationId,
  search,
  onRetry,
  onFindPeople,
}) {
  if (conversations.status === 'loading' && conversations.items.length === 0) {
    return (
      <>
        <span role="status" className="sr-only">
          Loading conversations
        </span>
        <ListSkeleton />
      </>
    );
  }

  if (conversations.status === 'error' && conversations.items.length === 0) {
    return (
      <div className="p-3">
        <Alert
          action={
            <Button variant="secondary" className="px-3 py-1.5" onClick={() => onRetry()}>
              Retry
            </Button>
          }
        >
          {conversations.error}
        </Alert>
      </div>
    );
  }

  const query = search.trim().toLowerCase();
  const items = conversations.items
    .map((conversation) => ({
      conversation,
      other: getOtherParticipant(conversation, currentUserId),
    }))
    .filter(
      ({ other }) =>
        !query ||
        other.name.toLowerCase().includes(query) ||
        other.email.toLowerCase().includes(query),
    );

  if (conversations.items.length === 0) {
    return (
      <EmptyState
        title="No conversations yet"
        description="Find someone in People to start your first chat."
        action={<Button onClick={onFindPeople}>Find people</Button>}
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="No matching conversations"
        description={`Nobody in your chats matches "${search.trim()}".`}
        action={
          <Button variant="secondary" onClick={onFindPeople}>
            Search all people
          </Button>
        }
      />
    );
  }

  return (
    <ul className="space-y-0.5 p-2" aria-label="Conversations">
      {items.map(({ conversation, other }) => {
        const isActive = conversation.id === activeConversationId;
        const { lastMessage } = conversation;
        const preview = lastMessage
          ? `${lastMessage.senderId === currentUserId ? 'You: ' : ''}${lastMessage.content}`
          : 'No messages yet';

        return (
          <li key={conversation.id}>
            <Link
              to={`/c/${conversation.id}`}
              aria-current={isActive ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600 ${
                isActive ? 'bg-brand-50' : 'hover:bg-slate-50'
              }`}
            >
              <Avatar name={other.name} seed={other.id} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium text-slate-900">{other.name}</span>
                  {lastMessage && (
                    <time
                      dateTime={lastMessage.createdAt}
                      title={formatFullDateTime(lastMessage.createdAt)}
                      className="shrink-0 text-xs text-slate-500"
                    >
                      {formatConversationTime(lastMessage.createdAt)}
                    </time>
                  )}
                </span>
                <span
                  className={`block truncate text-sm ${lastMessage ? 'text-slate-600' : 'italic text-slate-500'}`}
                >
                  {preview}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
