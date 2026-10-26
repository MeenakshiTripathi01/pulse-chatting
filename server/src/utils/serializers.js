import { getClearedAt } from '../models/Conversation.js';

// Explicit "allow-list" serializers: only the fields listed here ever leave the server,
// so sensitive fields (like passwordHash) cannot leak by accident.

export function toPublicUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    username: user.username ?? null,
    email: user.email,
  };
}

function toReplyDto(replyTo) {
  if (!replyTo) return null;
  const deleted = Boolean(replyTo.deleted);
  return {
    id: String(replyTo.messageId),
    senderId: String(replyTo.sender),
    content: deleted ? '' : (replyTo.content ?? ''),
    deleted,
  };
}

export function toMessageDto(message) {
  const deleted = Boolean(message.deletedAt);
  return {
    id: String(message._id),
    conversationId: String(message.conversation),
    senderId: String(message.sender),
    content: deleted ? '' : message.content,
    deleted,
    replyTo: toReplyDto(message.replyTo),
    clientMessageId: message.clientMessageId ?? null,
    createdAt: message.createdAt.toISOString(),
  };
}

/**
 * Expects `participants` to be populated with user documents. Pass `viewerId` to hide the
 * preview from a participant who deleted the chat after that message.
 */
export function toConversationDto(conversation, viewerId = null) {
  const { lastMessage } = conversation;
  const clearedAt = viewerId ? getClearedAt(conversation, viewerId) : null;
  const showPreview = lastMessage && !(clearedAt && lastMessage.createdAt <= clearedAt);
  return {
    id: String(conversation._id),
    type: conversation.type,
    // filter(Boolean) skips participants whose user document no longer exists.
    participants: conversation.participants.filter(Boolean).map(toPublicUser),
    lastMessage: showPreview
      ? {
          id: String(lastMessage.messageId),
          senderId: String(lastMessage.sender),
          content: lastMessage.deleted ? '' : lastMessage.content,
          deleted: Boolean(lastMessage.deleted),
          createdAt: lastMessage.createdAt.toISOString(),
        }
      : null,
    lastMessageAt: conversation.lastMessageAt.toISOString(),
    createdAt: conversation.createdAt.toISOString(),
  };
}
