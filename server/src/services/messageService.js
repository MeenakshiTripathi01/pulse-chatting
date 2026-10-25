import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { AppError } from '../utils/AppError.js';
import { toMessageDto } from '../utils/serializers.js';
import { assertConversationMember } from './conversationService.js';

const PREVIEW_LENGTH = 200;

/**
 * Cursor-based pagination: returns the `limit` newest messages older than `before`
 * (a message id), in chronological order. Unlike page numbers, a cursor doesn't skip or
 * repeat messages when new ones arrive while the user is scrolling back.
 */
export async function listMessages({ conversationId, userId, before, limit }) {
  await assertConversationMember(conversationId, userId);

  const filter = { conversation: conversationId };

  if (before) {
    const cursor = await Message.findOne({ _id: before, conversation: conversationId })
      .select('createdAt')
      .lean();
    if (!cursor) throw AppError.badRequest('Invalid pagination cursor', 'INVALID_CURSOR');

    filter.$or = [
      { createdAt: { $lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { $lt: cursor._id } },
    ];
  }

  // Fetch one extra document to learn whether an older page exists.
  const newestFirst = await Message.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean();

  const hasMore = newestFirst.length > limit;
  const page = newestFirst.slice(0, limit).reverse();

  return {
    messages: page.map(toMessageDto),
    hasMore,
    nextCursor: hasMore ? String(page[0]._id) : null,
  };
}

/**
 * Persists a message after verifying the sender belongs to the conversation.
 * Retries with the same clientMessageId return the originally stored message
 * (`duplicate: true`) instead of creating a second copy.
 */
export async function sendMessage({ conversationId, senderId, content, clientMessageId }) {
  await assertConversationMember(conversationId, senderId);

  if (clientMessageId) {
    const existing = await findByClientId(senderId, clientMessageId, conversationId);
    if (existing) return { message: existing, duplicate: true };
  }

  let message;
  try {
    message = await Message.create({
      conversation: conversationId,
      sender: senderId,
      content,
      clientMessageId,
    });
  } catch (error) {
    // A concurrent retry stored the same clientMessageId first.
    if (error.code === 11000 && clientMessageId) {
      const existing = await findByClientId(senderId, clientMessageId, conversationId);
      if (existing) return { message: existing, duplicate: true };
    }
    throw error;
  }

  // Only move the preview forward, never backwards, if messages finish saving out of order.
  await Conversation.updateOne(
    { _id: conversationId, lastMessageAt: { $lte: message.createdAt } },
    {
      $set: {
        lastMessage: {
          messageId: message._id,
          sender: message.sender,
          content: message.content.slice(0, PREVIEW_LENGTH),
          createdAt: message.createdAt,
        },
        lastMessageAt: message.createdAt,
      },
    },
  );

  return { message: toMessageDto(message), duplicate: false };
}

async function findByClientId(senderId, clientMessageId, conversationId) {
  const existing = await Message.findOne({ sender: senderId, clientMessageId }).lean();
  if (!existing) return null;

  if (String(existing.conversation) !== String(conversationId)) {
    throw AppError.conflict('This message id was already used', 'DUPLICATE_CLIENT_MESSAGE_ID');
  }
  return toMessageDto(existing);
}
