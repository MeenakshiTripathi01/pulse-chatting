import { useCallback, useEffect, useReducer, useRef } from 'react';
import * as conversationsApi from '../api/conversations.js';
import { getErrorMessage } from '../api/client.js';
import { useAuth } from '../context/authContext.js';
import { useSocket } from '../context/socketContext.js';
import { createClientMessageId } from '../lib/ids.js';
import { chatReducer, initialChatState } from '../state/chatReducer.js';

const SEND_TIMEOUT_MS = 10_000;

export function useChat(activeConversationId) {
  const { user } = useAuth();
  const { socket, readyCount } = useSocket();
  const [state, dispatch] = useReducer(chatReducer, initialChatState);

  // Event handlers and async callbacks read the latest state through refs, so they don't
  // need to be re-created (and re-subscribed) on every state change.
  const stateRef = useRef(state);
  const activeIdRef = useRef(activeConversationId);
  useEffect(() => {
    stateRef.current = state;
    activeIdRef.current = activeConversationId;
  });

  const loadConversations = useCallback(async ({ silent = false } = {}) => {
    if (!silent) dispatch({ type: 'conversations/loading' });
    try {
      const items = await conversationsApi.listConversations();
      dispatch({ type: 'conversations/loaded', items });
    } catch (error) {
      if (!silent) dispatch({ type: 'conversations/failed', error: getErrorMessage(error) });
    }
  }, []);

  const loadThread = useCallback(async (conversationId, mode = 'initial') => {
    if (mode === 'initial') dispatch({ type: 'thread/loading', conversationId });
    try {
      const page = await conversationsApi.listMessages(conversationId);
      dispatch({ type: 'thread/loaded', conversationId, page, mode });
    } catch (error) {
      if (mode === 'initial') {
        dispatch({
          type: 'thread/failed',
          conversationId,
          error: getErrorMessage(error),
          notFound: error.response?.status === 404,
        });
      }
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Load history the first time a conversation is opened, or refresh it if it went stale
  // while the socket was disconnected.
  useEffect(() => {
    if (!activeConversationId) return;
    const thread = stateRef.current.threads[activeConversationId];
    if (!thread || thread.status === 'idle') loadThread(activeConversationId, 'initial');
    else if (thread.stale && thread.status === 'success')
      loadThread(activeConversationId, 'resync');
  }, [activeConversationId, loadThread]);

  // A conversation opened by URL that isn't in the list yet (e.g. just created by the other
  // user while we were offline): fetch it individually.
  const conversationsStatus = state.conversations.status;
  const activeIsKnown = state.conversations.items.some((c) => c.id === activeConversationId);
  useEffect(() => {
    if (!activeConversationId || conversationsStatus !== 'success' || activeIsKnown) return;
    conversationsApi
      .getConversation(activeConversationId)
      .then((conversation) => dispatch({ type: 'conversation/upserted', conversation }))
      .catch((error) =>
        dispatch({
          type: 'thread/failed',
          conversationId: activeConversationId,
          error: getErrorMessage(error),
          notFound: error.response?.status === 404,
        }),
      );
  }, [activeConversationId, conversationsStatus, activeIsKnown]);

  // Live events from the server.
  useEffect(() => {
    if (!socket) return undefined;

    const handleNewMessage = async ({ message }) => {
      const known = stateRef.current.conversations.items.some(
        (c) => c.id === message.conversationId,
      );
      if (!known) {
        try {
          const conversation = await conversationsApi.getConversation(message.conversationId);
          dispatch({ type: 'conversation/upserted', conversation });
        } catch {
          // The next resync will pick it up.
        }
      }
      dispatch({ type: 'message/received', message });
    };
    const handleNewConversation = ({ conversation }) => {
      dispatch({ type: 'conversation/upserted', conversation });
    };

    socket.on('message:new', handleNewMessage);
    socket.on('conversation:new', handleNewConversation);
    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('conversation:new', handleNewConversation);
    };
  }, [socket]);

  // After every (re)connection, catch up on anything missed while disconnected.
  useEffect(() => {
    if (readyCount === 0) return;
    loadConversations({ silent: true });
    dispatch({ type: 'threads/markStale' });
    const activeId = activeIdRef.current;
    if (activeId && stateRef.current.threads[activeId]?.status === 'success') {
      loadThread(activeId, 'resync');
    }
  }, [readyCount, loadConversations, loadThread]);

  const deliver = useCallback(
    async (conversationId, clientMessageId, content) => {
      const fail = (error) =>
        dispatch({ type: 'message/failed', conversationId, clientMessageId, error });

      if (!socket?.connected) {
        fail("You're offline. The message will be sent when you retry after reconnecting.");
        return;
      }

      try {
        const response = await socket
          .timeout(SEND_TIMEOUT_MS)
          .emitWithAck('message:send', { conversationId, content, clientMessageId });

        if (response?.ok) dispatch({ type: 'message/confirmed', message: response.message });
        else fail(response?.error?.message ?? 'The message could not be sent.');
      } catch {
        // No acknowledgement in time. Retrying is safe: the server ignores duplicate
        // clientMessageIds.
        fail('The server did not respond in time.');
      }
    },
    [socket],
  );

  const sendMessage = useCallback(
    (conversationId, content) => {
      const clientMessageId = createClientMessageId();
      dispatch({
        type: 'message/pending',
        message: {
          id: `pending-${clientMessageId}`,
          clientMessageId,
          conversationId,
          senderId: user.id,
          content,
          createdAt: new Date().toISOString(),
          status: 'sending',
          error: null,
        },
      });
      return deliver(conversationId, clientMessageId, content);
    },
    [deliver, user.id],
  );

  const retryMessage = useCallback(
    (message) => {
      dispatch({
        type: 'message/retrying',
        conversationId: message.conversationId,
        clientMessageId: message.clientMessageId,
      });
      return deliver(message.conversationId, message.clientMessageId, message.content);
    },
    [deliver],
  );

  const loadOlderMessages = useCallback(async (conversationId) => {
    const thread = stateRef.current.threads[conversationId];
    if (!thread?.hasMore || thread.olderStatus === 'loading') return;

    dispatch({ type: 'older/loading', conversationId });
    try {
      const page = await conversationsApi.listMessages(conversationId, {
        before: thread.nextCursor,
      });
      dispatch({ type: 'older/loaded', conversationId, page });
    } catch (error) {
      dispatch({ type: 'older/failed', conversationId, error: getErrorMessage(error) });
    }
  }, []);

  const startConversation = useCallback(async (participantId) => {
    const conversation = await conversationsApi.createConversation(participantId);
    dispatch({ type: 'conversation/upserted', conversation });
    return conversation;
  }, []);

  return {
    conversations: state.conversations,
    activeConversation:
      state.conversations.items.find((c) => c.id === activeConversationId) ?? null,
    activeThread: activeConversationId ? (state.threads[activeConversationId] ?? null) : null,
    reloadConversations: loadConversations,
    reloadThread: loadThread,
    sendMessage,
    retryMessage,
    loadOlderMessages,
    startConversation,
  };
}
