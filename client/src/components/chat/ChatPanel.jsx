import { useState } from 'react';
import { Link } from 'react-router';
import { getErrorMessage } from '../../api/client.js';
import { formatLastSeen, formatUserHandle, getOtherParticipant } from '../../lib/format.js';
import { Alert } from '../ui/Alert.jsx';
import { Avatar } from '../ui/Avatar.jsx';
import { Button } from '../ui/Button.jsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.jsx';
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

/** "Online", "last seen today at 3:45 PM", "Offline", or null while unknown. */
function describePresence(status) {
  if (!status) return null;
  if (status.online) return 'Online';
  return status.lastSeenAt ? formatLastSeen(status.lastSeenAt) : 'Offline';
}

export function ChatPanel({
  conversationId,
  conversation,
  thread,
  currentUserId,
  connection,
  presence = {},
  typingIn = {},
  onSend,
  onTyping,
  onStopTyping,
  onRetryMessage,
  onDeleteMessage,
  onDeleteConversation,
  onLoadOlder,
  onReloadThread,
  className = '',
}) {
  // The message being replied to, remembered per conversation.
  const [reply, setReply] = useState(null);
  // Pending confirmation: { kind: 'message', message } or { kind: 'conversation' }.
  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState(null);

  function openConfirm(next) {
    setConfirm(next);
    setConfirmError(null);
  }

  async function handleConfirm() {
    setConfirmBusy(true);
    setConfirmError(null);
    try {
      if (confirm.kind === 'message') await onDeleteMessage(confirm.message.id);
      else await onDeleteConversation();
      setConfirm(null);
    } catch (error) {
      setConfirmError(getErrorMessage(error, 'That could not be deleted. Please try again.'));
    } finally {
      setConfirmBusy(false);
    }
  }

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
  // While we're disconnected, their status may be out of date, so don't show it.
  const otherStatus = isConnected && other ? presence[other.id] : null;
  const otherIsTyping = isConnected && Boolean(typingIn[conversationId]);
  const presenceText = describePresence(otherStatus);

  // Drop the reply if it belongs to another conversation or the message was since deleted.
  const replyMessage =
    reply?.conversationId === conversationId
      ? thread?.messages?.find((message) => message.id === reply.message.id)
      : null;
  const replyingTo = replyMessage && !replyMessage.deleted ? replyMessage : null;

  function handleSend(content) {
    onSend(content, replyingTo);
    setReply(null);
  }

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
        otherName={other?.name ?? 'Them'}
        onLoadOlder={onLoadOlder}
        onRetry={onRetryMessage}
        onReply={(message) => setReply({ conversationId, message })}
        onDelete={(message) => openConfirm({ kind: 'message', message })}
      />
    );
  }

  return (
    <section
      aria-label={other ? `Chat with ${other.name}` : 'Chat'}
      className={`min-h-0 flex-col bg-slate-50 ${className}`}
    >
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <BackLink />
        {other ? (
          <>
            <Avatar name={other.name} seed={other.id} online={Boolean(otherStatus?.online)} />
            <div className="min-w-0">
              <h2 className="truncate font-semibold text-slate-900">{other.name}</h2>
              <p className="truncate text-sm text-slate-600">
                {otherIsTyping ? (
                  <span className="font-medium text-emerald-700">typing…</span>
                ) : (
                  <>
                    {formatUserHandle(other)}
                    {presenceText && (
                      <>
                        {' · '}
                        <span className={otherStatus.online ? 'font-medium text-emerald-700' : ''}>
                          {presenceText}
                        </span>
                      </>
                    )}
                  </>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => openConfirm({ kind: 'conversation' })}
              aria-label="Delete chat"
              title="Delete chat"
              className="ml-auto grid size-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-brand-600"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-5">
                <path
                  fillRule="evenodd"
                  d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.44c-.8.08-1.58.17-2.36.29a.75.75 0 0 0 .22 1.48l.15-.02.83 10.36A2.75 2.75 0 0 0 7.58 19h4.84a2.75 2.75 0 0 0 2.74-2.7l.83-10.36.15.02a.75.75 0 1 0 .22-1.48c-.78-.12-1.57-.21-2.36-.29v-.44A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.67.03 2.5.08v-.33c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.33C8.33 4.03 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
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
          onSend={handleSend}
          onTyping={onTyping}
          onStopTyping={onStopTyping}
          replyingTo={replyingTo}
          replyingToName={replyingTo?.senderId === currentUserId ? 'yourself' : other.name}
          onCancelReply={() => setReply(null)}
          disabled={!isConnected}
          disabledReason="Waiting for connection. You can send once you're back online."
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.kind === 'message' ? 'Delete message?' : 'Delete this chat?'}
          description={
            confirm.kind === 'message'
              ? `It will be removed for everyone. ${other?.name ?? 'They'} will see "This message was deleted".`
              : `The chat and its messages will be removed from your list. ${other?.name ?? 'The other person'} keeps their copy, and new messages will start a fresh chat.`
          }
          confirmLabel={confirm.kind === 'message' ? 'Delete for everyone' : 'Delete chat'}
          busy={confirmBusy}
          error={confirmError}
          onConfirm={handleConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </section>
  );
}
