import { User } from '../models/User.js';
import { listConversationPartnerIds } from '../services/conversationService.js';
import { presenceQuerySchema, typingSchema } from '../validation/schemas.js';
import { conversationRoom } from './rooms.js';

const TYPING_WINDOW_MS = 10_000;
const MAX_TYPING_EVENTS_PER_WINDOW = 20;

/**
 * Counts open sockets per user (a user can have several tabs or devices). In memory, so it
 * assumes a single server instance, like the Socket.IO rooms themselves.
 */
export function createPresenceTracker() {
  const openSockets = new Map();
  return {
    isOnline: (userId) => openSockets.has(userId),
    /** Returns true when this is the user's first open socket, i.e. they just came online. */
    add(userId) {
      const count = (openSockets.get(userId) ?? 0) + 1;
      openSockets.set(userId, count);
      return count === 1;
    },
    /** Returns true when that was the user's last open socket, i.e. they just went offline. */
    remove(userId) {
      const count = (openSockets.get(userId) ?? 1) - 1;
      if (count > 0) {
        openSockets.set(userId, count);
        return false;
      }
      openSockets.delete(userId);
      return true;
    },
  };
}

function conversationRoomsOf(socket) {
  return [...socket.rooms].filter((room) => room.startsWith('conversation:'));
}

/** Tells everyone sharing a conversation with this socket's user about a presence change. */
function announce(socket, update) {
  const rooms = conversationRoomsOf(socket);
  // An empty room list would broadcast to every connected socket.
  if (rooms.length > 0) socket.to(rooms).emit('presence:update', update);
}

/** Call once the socket has joined its rooms. */
export function markOnline(socket, tracker) {
  const userId = socket.data.user.id;
  socket.data.countedOnline = true;
  if (tracker.add(userId)) announce(socket, { userId, online: true, lastSeenAt: null });
}

function isTypingRateLimited(socket) {
  const now = Date.now();
  socket.data.recentTyping = socket.data.recentTyping.filter(
    (time) => now - time < TYPING_WINDOW_MS,
  );
  if (socket.data.recentTyping.length >= MAX_TYPING_EVENTS_PER_WINDOW) return true;
  socket.data.recentTyping.push(now);
  return false;
}

/**
 * "presence:get"  client → server  { userIds }  → "presence:snapshot" { presence } to the
 *                 caller, limited to people who share a conversation with them.
 * "typing"        client → server  { conversationId, isTyping }  → same event, plus userId,
 *                 to the other members of that conversation.
 */
export function registerPresenceHandlers(socket, tracker) {
  const userId = socket.data.user.id;
  socket.data.recentTyping = [];

  socket.on('disconnecting', () => {
    if (!socket.data.countedOnline) return;
    socket.data.countedOnline = false;
    if (!tracker.remove(userId)) return;

    const lastSeenAt = new Date();
    announce(socket, { userId, online: false, lastSeenAt: lastSeenAt.toISOString() });
    User.updateOne({ _id: userId }, { lastSeenAt }).catch((error) => {
      console.error('[socket] Failed to save last seen time:', error.message);
    });
  });

  socket.on('presence:get', async (payload) => {
    const parsed = presenceQuerySchema.safeParse(payload);
    if (!parsed.success) return;

    try {
      const partnerIds = await listConversationPartnerIds(userId);
      const ids = parsed.data.userIds.filter((id) => partnerIds.has(id));
      const users = await User.find({ _id: { $in: ids } })
        .select('lastSeenAt')
        .lean();

      const presence = {};
      for (const user of users) {
        const id = String(user._id);
        presence[id] = tracker.isOnline(id)
          ? { online: true, lastSeenAt: null }
          : { online: false, lastSeenAt: user.lastSeenAt?.toISOString() ?? null };
      }
      socket.emit('presence:snapshot', { presence });
    } catch (error) {
      console.error('[socket] presence:get failed:', error.message);
    }
  });

  socket.on('typing', (payload) => {
    if (Date.now() >= socket.data.sessionExpiresAt) return;
    const parsed = typingSchema.safeParse(payload);
    if (!parsed.success) return;

    const { conversationId, isTyping } = parsed.data;
    const room = conversationRoom(conversationId);
    // Only the server puts sockets in conversation rooms, so membership is the access check.
    if (!socket.rooms.has(room) || isTypingRateLimited(socket)) return;

    socket.to(room).emit('typing', { conversationId, userId, isTyping });
  });
}
