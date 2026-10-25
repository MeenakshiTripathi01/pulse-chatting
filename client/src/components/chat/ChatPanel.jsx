import { Link } from 'react-router';
import { getOtherParticipant } from '../../lib/format.js';
import { Alert } from '../ui/Alert.jsx';
import { Avatar } from '../ui/Avatar.jsx';
import { Button } from '../ui/Button.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { EmptyState } from './EmptyState.jsx';
import { MessageComposer } from './MessageComposer.jsx';
import { MessageList } from './MessageList.jsx';

const chatIcon = (
  <svg viewBox="0 0 24 24" className="size-12" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M8 10h8M8 14h5M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4V6Z"
    />
  </svg>
);

function BackLink() {
  return (
    <Link
      to="/"
      aria-label="Back to conversations"
      className="-ml-2 grid size-9 place-items-center rounded-lg text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-600 md:hidden"
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-5">
        <path
          fillRule="evenodd"
          d="M12.8 4.2a.75.75 0 0 1 0 1.06L8.06 10l4.74 4.74a.75.75 0 1 1-1.06 1.06l-5.27-5.27a.75.75 0 0 1 0-1.06l5.27-5.27a.75.75 0 0 1 1.06 0Z"
          clipRule="evenodd"
        />
      </svg>
    </Link>
  );
}

export function ChatPanel({
  conversationId,
  conversation,
  thread,
  currentUserId,
  connection,
  onSend,
  onRetryMessage,
  onLoadOlder,
  onReloadThread,
  className = '',
}) {
  if (!conversationId) {
    return (
      <section className={`items-center justify-center bg-slate-50 ${className}`}>
        <EmptyState
          icon={chatIcon}
          title="Select a conversation"
          description="Choose a chat from the list, or open People to start a new one."
        />
      </section>
    );
  }

  if (thread?.notFound) {
    return (
      <section className={`flex-col bg-slate-50 ${className}`}>
        <div className="flex items-center border-b border-slate-200 bg-white px-4 py-3">
          <BackLink />
        </div>
        <EmptyState
          title="Conversation not found"
          description="It may not exist, or you may not have access to it."
          action={
            <Link to="/" className="font-medium text-brand-700 underline underline-offset-2">
              Back to conversations
            </Link>
          }
        />
      </section>
    );
  }

  const other = conversation ? getOtherParticipant(conversation, currentUserId) : null;
  const isConnected = connection === 'connected';

  let body;
  if (!thread || thread.status === 'loading' || thread.status === 'idle') {
    body = (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-600">
        <Spinner className="size-4" />
        <span role="status">Loading messages…</span>
      </div>
    );
  } else if (thread.status === 'error') {
    body = (
      <div className="flex flex-1 items-center justify-center p-6">
        <Alert
          action={
            <Button variant="secondary" className="px-3 py-1.5" onClick={onReloadThread}>
              Retry
            </Button>
          }
        >
          {thread.error}
        </Alert>
      </div>
    );
  } else if (thread.messages.length === 0) {
    body = (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState
          icon={chatIcon}
          title="No messages yet"
          description={`Say hello to ${other?.name ?? 'start the conversation'}.`}
        />
      </div>
    );
  } else {
    body = (
      <MessageList
        conversationId={conversationId}
        thread={thread}
        currentUserId={currentUserId}
        onLoadOlder={onLoadOlder}
        onRetry={onRetryMessage}
      />
    );
  }

  return (
    <section aria-label={other ? `Chat with ${other.name}` : 'Chat'} className={`min-h-0 flex-col bg-slate-50 ${className}`}>
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <BackLink />
        {other ? (
          <>
            <Avatar name={other.name} seed={other.id} />
            <div className="min-w-0">
              <h2 className="truncate font-semibold text-slate-900">{other.name}</h2>
              <p className="truncate text-sm text-slate-600">{other.email}</p>
            </div>
          </>
        ) : (
          <div className="h-10 w-40 animate-pulse rounded bg-slate-100" aria-hidden="true" />
        )}
      </header>

      {body}

      {thread?.status === 'success' && other && (
        <MessageComposer
          key={conversationId}
          recipientName={other.name}
          onSend={onSend}
          disabled={!isConnected}
          disabledReason="Waiting for connection. You can send once you're back online."
        />
      )}
    </section>
  );
}
