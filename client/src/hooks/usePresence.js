import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/authContext.js';
import { useSocket } from '../context/socketContext.js';

// While someone keeps typing, their client repeats "typing" every TYPING_RESEND_MS, so the
// receiver can safely drop the indicator after TYPING_EXPIRY_MS without a refresh (for
// example when the typist closes the tab mid-sentence).
export const TYPING_RESEND_MS = 2_500;
export const TYPING_IDLE_MS = 3_000;
export const TYPING_EXPIRY_MS = 6_000;

/**
 * Online status of chat partners and who is typing where, plus `startTyping`/`stopTyping`
 * to announce our own typing.
 *
 * presence: { [userId]: { online, lastSeenAt } }
 * typingIn: { [conversationId]: true } — the other participant is typing there
 */
export function usePresence(partnerIds) {
  const { user } = useAuth();
  const { socket, readyCount } = useSocket();
  const [presence, setPresence] = useState({});
  const [typingIn, setTypingIn] = useState({});
  const expiryTimers = useRef(new Map());
  const outgoing = useRef({ conversationId: null, lastSentAt: 0, idleTimer: null });

  const partnerKey = [...new Set(partnerIds)].sort().join(',');

  // Ask for a fresh snapshot after every (re)connection and whenever the partner list changes.
  useEffect(() => {
    if (readyCount === 0 || !partnerKey) return;
    socket.emit('presence:get', { userIds: partnerKey.split(',') });
  }, [socket, readyCount, partnerKey]);

  const setTyping = useCallback((conversationId, isTyping) => {
    const timers = expiryTimers.current;
    clearTimeout(timers.get(conversationId));
    timers.delete(conversationId);
    if (isTyping) {
      timers.set(
        conversationId,
        setTimeout(() => setTyping(conversationId, false), TYPING_EXPIRY_MS),
      );
    }
    setTypingIn((current) => {
      if (Boolean(current[conversationId]) === isTyping) return current;
      const next = { ...current };
      if (isTyping) next[conversationId] = true;
      else delete next[conversationId];
      return next;
    });
  }, []);

  useEffect(() => {
    const handleSnapshot = ({ presence: snapshot }) => {
      setPresence((current) => ({ ...current, ...snapshot }));
    };
    const handleUpdate = ({ userId, online, lastSeenAt }) => {
      setPresence((current) => ({ ...current, [userId]: { online, lastSeenAt } }));
    };
    const handleTyping = ({ conversationId, userId, isTyping }) => {
      if (userId !== user.id) setTyping(conversationId, isTyping);
    };
    // A message from the typist ends their typing indicator immediately.
    const handleMessage = ({ message }) => {
      if (message.senderId !== user.id) setTyping(message.conversationId, false);
    };

    socket.on('presence:snapshot', handleSnapshot);
    socket.on('presence:update', handleUpdate);
    socket.on('typing', handleTyping);
    socket.on('message:new', handleMessage);
    return () => {
      socket.off('presence:snapshot', handleSnapshot);
      socket.off('presence:update', handleUpdate);
      socket.off('typing', handleTyping);
      socket.off('message:new', handleMessage);
    };
  }, [socket, user.id, setTyping]);

  useEffect(() => {
    const timers = expiryTimers.current;
    const sending = outgoing.current;
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(sending.idleTimer);
    };
  }, []);

  const stopTyping = useCallback(() => {
    const state = outgoing.current;
    clearTimeout(state.idleTimer);
    if (state.conversationId && socket.connected) {
      socket.emit('typing', { conversationId: state.conversationId, isTyping: false });
    }
    state.conversationId = null;
    state.lastSentAt = 0;
  }, [socket]);

  const startTyping = useCallback(
    (conversationId) => {
      const state = outgoing.current;
      if (state.conversationId && state.conversationId !== conversationId) stopTyping();

      const now = Date.now();
      if (now - state.lastSentAt >= TYPING_RESEND_MS && socket.connected) {
        socket.emit('typing', { conversationId, isTyping: true });
        state.lastSentAt = now;
      }
      state.conversationId = conversationId;
      clearTimeout(state.idleTimer);
      state.idleTimer = setTimeout(stopTyping, TYPING_IDLE_MS);
    },
    [socket, stopTyping],
  );

  return { presence, typingIn, startTyping, stopTyping };
}
