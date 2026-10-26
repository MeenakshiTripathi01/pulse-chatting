// Pure state transitions for conversations and message threads. Keeping this free of React
// and network code makes the tricky parts (deduplication, ordering) easy to unit test.

export const initialChatState = {
  conversations: { status: 'loading', error: null, items: [] },
  // threads[conversationId] = { status, error, notFound, messages, hasMore, nextCursor,
  //                             olderStatus, olderError, stale }
  threads: {},
};

const emptyThread = {
  status: 'idle',
  error: null,
  notFound: false,
  messages: [],
  hasMore: false,
  nextCursor: null,
  olderStatus: 'idle',
  olderError: null,
  stale: false,
};

const isUnconfirmed = (message) => message.status === 'sending' || message.status === 'failed';

function compareMessages(a, b) {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

function sortConversations(items) {
  return [...items].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}

/**
 * Combines messages we already have with messages from the server.
 * - Server messages are keyed by id, so receiving the same message twice keeps one copy.
 * - An optimistic (unconfirmed) message is dropped once a server message with the same
 *   clientMessageId arrives, whether via the ack or the broadcast, in whichever order.
 */
export function mergeMessages(existing, incoming) {
  const confirmed = new Map();
  const unconfirmed = [];

  for (const message of existing) {
    if (isUnconfirmed(message)) unconfirmed.push(message);
    else confirmed.set(message.id, message);
  }
  for (const message of incoming) {
    confirmed.set(message.id, { ...message, status: 'sent', error: null });
  }

  const confirmedClientIds = new Set(
    [...confirmed.values()].map((message) => message.clientMessageId).filter(Boolean),
  );

  return [
    ...[...confirmed.values()].sort(compareMessages),
    ...unconfirmed.filter((message) => !confirmedClientIds.has(message.clientMessageId)),
  ];
}

function updateThread(state, conversationId, updater) {
  const thread = state.threads[conversationId] ?? emptyThread;
  return { ...state, threads: { ...state.threads, [conversationId]: updater(thread) } };
}

function applyPreview(state, message) {
  const items = state.conversations.items.map((conversation) => {
    if (conversation.id !== message.conversationId) return conversation;
    if (conversation.lastMessage?.id === message.id) return conversation;
    if (conversation.lastMessage && message.createdAt < conversation.lastMessage.createdAt) {
      return conversation;
    }
    return {
      ...conversation,
      lastMessage: {
        id: message.id,
        senderId: message.senderId,
        content: message.content,
        deleted: Boolean(message.deleted),
        createdAt: message.createdAt,
      },
      lastMessageAt: message.createdAt,
    };
  });
  return { ...state, conversations: { ...state.conversations, items: sortConversations(items) } };
}

function addServerMessage(state, message) {
  let next = applyPreview(state, message);
  const thread = next.threads[message.conversationId];
  // Threads that were never opened will load full history when opened.
  if (thread && thread.status !== 'idle') {
    next = updateThread(next, message.conversationId, (current) => ({
      ...current,
      messages: mergeMessages(current.messages, [message]),
    }));
  }
  return next;
}

/** Replaces a message with its deleted version and blanks out any quotes of it. */
function applyDeletion(state, deleted) {
  const { id, conversationId } = deleted;
  const items = state.conversations.items.map((conversation) =>
    conversation.id === conversationId && conversation.lastMessage?.id === id
      ? {
          ...conversation,
          lastMessage: { ...conversation.lastMessage, content: '', deleted: true },
        }
      : conversation,
  );
  const next = { ...state, conversations: { ...state.conversations, items } };
  if (!next.threads[conversationId]) return next;

  return updateThread(next, conversationId, (thread) => ({
    ...thread,
    messages: thread.messages.map((message) => {
      if (message.id === id) return { ...message, ...deleted, status: 'sent', error: null };
      if (message.replyTo?.id === id) {
        return { ...message, replyTo: { ...message.replyTo, content: '', deleted: true } };
      }
      return message;
    }),
  }));
}

function setMessageStatus(state, conversationId, clientMessageId, changes) {
  return updateThread(state, conversationId, (thread) => ({
    ...thread,
    messages: thread.messages.map((message) =>
      message.clientMessageId === clientMessageId && isUnconfirmed(message)
        ? { ...message, ...changes }
        : message,
    ),
  }));
}

export function chatReducer(state, action) {
  switch (action.type) {
    case 'conversations/loading':
      return {
        ...state,
        conversations: { ...state.conversations, status: 'loading', error: null },
      };

    case 'conversations/loaded':
      return {
        ...state,
        conversations: { status: 'success', error: null, items: sortConversations(action.items) },
      };

    case 'conversations/failed':
      return {
        ...state,
        conversations: { ...state.conversations, status: 'error', error: action.error },
      };

    case 'conversation/upserted': {
      const others = state.conversations.items.filter((c) => c.id !== action.conversation.id);
      return {
        ...state,
        conversations: {
          ...state.conversations,
          items: sortConversations([...others, action.conversation]),
        },
      };
    }

    case 'thread/loading':
      return updateThread(state, action.conversationId, (thread) => ({
        ...thread,
        status: 'loading',
        error: null,
        notFound: false,
      }));

    case 'thread/loaded': {
      const { page, mode } = action;
      return updateThread(state, action.conversationId, (thread) => {
        const confirmed = thread.messages.filter((message) => !isUnconfirmed(message));
        const newestKnown = confirmed.at(-1);
        // After a long disconnect the latest page may not overlap what we have; keeping both
        // would show a misleading gap, so start over from the latest page.
        const hasGap =
          mode === 'resync' &&
          page.hasMore &&
          newestKnown &&
          !page.messages.some((message) => message.id === newestKnown.id);
        const startFresh = mode === 'initial' || hasGap;
        const base = hasGap ? thread.messages.filter(isUnconfirmed) : thread.messages;

        return {
          ...thread,
          status: 'success',
          error: null,
          notFound: false,
          stale: false,
          messages: mergeMessages(base, page.messages),
          hasMore: startFresh ? page.hasMore : thread.hasMore,
          nextCursor: startFresh ? page.nextCursor : thread.nextCursor,
        };
      });
    }

    case 'thread/failed':
      return updateThread(state, action.conversationId, (thread) => ({
        ...thread,
        status: 'error',
        error: action.error,
        notFound: Boolean(action.notFound),
      }));

    case 'threads/markStale': {
      const threads = Object.fromEntries(
        Object.entries(state.threads).map(([id, thread]) => [id, { ...thread, stale: true }]),
      );
      return { ...state, threads };
    }

    case 'older/loading':
      return updateThread(state, action.conversationId, (thread) => ({
        ...thread,
        olderStatus: 'loading',
        olderError: null,
      }));

    case 'older/loaded':
      return updateThread(state, action.conversationId, (thread) => ({
        ...thread,
        olderStatus: 'idle',
        messages: mergeMessages(thread.messages, action.page.messages),
        hasMore: action.page.hasMore,
        nextCursor: action.page.nextCursor,
      }));

    case 'older/failed':
      return updateThread(state, action.conversationId, (thread) => ({
        ...thread,
        olderStatus: 'error',
        olderError: action.error,
      }));

    case 'message/pending':
      return updateThread(state, action.message.conversationId, (thread) => ({
        ...thread,
        messages: [...thread.messages, action.message],
      }));

    case 'message/retrying':
      return setMessageStatus(state, action.conversationId, action.clientMessageId, {
        status: 'sending',
        error: null,
      });

    case 'message/failed':
      return setMessageStatus(state, action.conversationId, action.clientMessageId, {
        status: 'failed',
        error: action.error,
      });

    case 'message/confirmed':
    case 'message/received':
      return addServerMessage(state, action.message);

    case 'message/deleted':
      return applyDeletion(state, action.message);

    case 'conversation/removed': {
      const { [action.conversationId]: _removed, ...threads } = state.threads;
      return {
        ...state,
        conversations: {
          ...state.conversations,
          items: state.conversations.items.filter((c) => c.id !== action.conversationId),
        },
        threads,
      };
    }

    default:
      throw new Error(`Unknown chat action: ${action.type}`);
  }
}
