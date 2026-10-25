import { sendMessage } from '../services/messageService.js';
import { AppError } from '../utils/AppError.js';
import { formatZodError } from '../validation/formatZodError.js';
import { sendMessageSchema } from '../validation/schemas.js';
import { conversationRoom } from './rooms.js';

const SEND_WINDOW_MS = 10_000;
const MAX_SENDS_PER_WINDOW = 30;

function failure(code, message, details) {
  return { ok: false, error: { code, message, ...(details ? { details } : {}) } };
}

function isRateLimited(socket) {
  const now = Date.now();
  socket.data.recentSends = socket.data.recentSends.filter((time) => now - time < SEND_WINDOW_MS);
  if (socket.data.recentSends.length >= MAX_SENDS_PER_WINDOW) return true;
  socket.data.recentSends.push(now);
  return false;
}

/**
 * "message:send" — payload: { conversationId, content, clientMessageId? }
 *
 * The client must pass an acknowledgement callback. It receives { ok: true, message } only
 * after MongoDB has stored the message, so the sender's UI can't show a message as sent
 * when it was actually lost.
 */
export function registerMessageHandlers(io, socket) {
  socket.on('message:send', async (payload, ack) => {
    if (typeof ack !== 'function') return;

    if (Date.now() >= socket.data.sessionExpiresAt) {
      ack(failure('SESSION_EXPIRED', 'Your session has expired. Please log in again.'));
      socket.disconnect(true);
      return;
    }

    if (isRateLimited(socket)) {
      ack(failure('RATE_LIMITED', 'You are sending messages too quickly. Please slow down.'));
      return;
    }

    const parsed = sendMessageSchema.safeParse(payload);
    if (!parsed.success) {
      const details = formatZodError(parsed.error);
      ack(failure('VALIDATION_ERROR', Object.values(details)[0], details));
      return;
    }

    try {
      const { message, duplicate } = await sendMessage({
        ...parsed.data,
        senderId: socket.data.user.id,
      });

      ack({ ok: true, message });

      // A retried send was already broadcast the first time.
      if (!duplicate) {
        io.to(conversationRoom(message.conversationId)).emit('message:new', { message });
      }
    } catch (error) {
      if (error instanceof AppError) {
        ack(failure(error.code, error.message));
        return;
      }
      console.error('[socket] message:send failed:', error);
      ack(failure('INTERNAL_ERROR', 'Your message could not be sent. Please try again.'));
    }
  });
}
