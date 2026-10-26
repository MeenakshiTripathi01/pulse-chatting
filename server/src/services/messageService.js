import { Conversation, getClearedAt } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { AppError } from '../utils/AppError.js';
import { toMessageDto } from '../utils/serializers.js';
import { assertConversationMember } from './conversationService.js';

const PREVIEW_LENGTH = 200;

/**
 * Cursor-based pagination: returns the `limit` newest messages older than `before`
 * (a message id), in chronological order. Unlike page numbers, a cursor doesn't skip or
 * repeat messages when new ones arrive while the user is scrolling back.
 * Messages from before the user deleted the chat are left out.
 */
export async function listMessages({ conversationId, userId, before, limit }) {
  const conversation = await Conversation.findOne({ _id: conversationId, participants: userId })
    .select('clearedBy')
    .lean();
  if (!conversation) throw AppError.notFound('Conversation not found', 'CONVERSATION_NOT_FOUND');

  const filter = { conversation: conversationId };
  const clearedAt = getClearedAt(conversation, userId);
  if (clearedAt) filter.createdAt = { $gt: clearedAt };

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
export async function sendMessage({
  conversationId,
  senderId,
  content,
  clientMessageId,
  replyToId,
}) {
  await assertConversationMember(conversationId, senderId);

  if (clientMessageId) {
    const existing = await findByClientId(senderId, clientMessageId, conversationId);
    if (existing) return { message: existing, duplicate: true };
  }

  const replyTo = replyToId ? await buildReplySnapshot(replyToId, conversationId) : null;

  let message;
  try {
    message = await Message.create({
      conversation: conversationId,
      sender: senderId,
      content,
      replyTo,
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
          deleted: false,
          createdAt: message.createdAt,
        },
        lastMessageAt: message.createdAt,
      },
    },
  );

  return { message: toMessageDto(message), duplicate: false };
}

/**
 * Deletes a message for everyone. Only its sender may do this; the message stays in the
 * thread as a "This message was deleted" placeholder, and quotes of it lose their text.
 */
export async function deleteMessage({ conversationId, messageId, userId }) {
  await assertConversationMember(conversationId, userId);

  const message = await Message.findOne({ _id: messageId, conversation: conversationId });
  if (!message) throw AppError.notFound('Message not found', 'MESSAGE_NOT_FOUND');
  if (String(message.sender) !== String(userId)) {
    throw AppError.forbidden('You can only delete your own messages', 'NOT_MESSAGE_SENDER');
  }
  if (message.deletedAt) return toMessageDto(message);

  message.deletedAt = new Date();
  message.content = undefined;
  await message.save();

  await Promise.all([
    Message.updateMany(
      { 'replyTo.messageId': message._id },
      { $set: { 'replyTo.deleted': true }, $unset: { 'replyTo.content': '' } },
    ),
    Conversation.updateOne(
      { _id: conversationId, 'lastMessage.messageId': message._id },
      { $set: { 'lastMessage.content': '', 'lastMessage.deleted': true } },
    ),
  ]);

  return toMessageDto(message);
}

async function buildReplySnapshot(replyToId, conversationId) {
  const original = await Message.findOne({ _id: replyToId, conversation: conversationId }).lean();
  if (!original || original.deletedAt) {
    throw AppError.badRequest(
      'The message you are replying to is no longer available',
      'INVALID_REPLY',
    );
  }
  return {
    messageId: original._id,
    sender: original.sender,
    content: original.content.slice(0, PREVIEW_LENGTH),
  };
}

async function findByClientId(senderId, clientMessageId, conversationId) {
  const existing = await Message.findOne({ sender: senderId, clientMessageId }).lean();
  if (!existing) return null;

  if (String(existing.conversation) !== String(conversationId)) {
    throw AppError.conflict('This message id was already used', 'DUPLICATE_CLIENT_MESSAGE_ID');
  }
  return toMessageDto(existing);
}
