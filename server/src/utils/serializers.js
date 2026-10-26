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

export function toMessageDto(message) {
  return {
    id: String(message._id),
    conversationId: String(message.conversation),
    senderId: String(message.sender),
    content: message.content,
    clientMessageId: message.clientMessageId ?? null,
    createdAt: message.createdAt.toISOString(),
  };
}

/** Expects `participants` to be populated with user documents. */
export function toConversationDto(conversation) {
  const { lastMessage } = conversation;
  return {
    id: String(conversation._id),
    type: conversation.type,
    // filter(Boolean) skips participants whose user document no longer exists.
    participants: conversation.participants.filter(Boolean).map(toPublicUser),
    lastMessage: lastMessage
      ? {
          id: String(lastMessage.messageId),
          senderId: String(lastMessage.sender),
          content: lastMessage.content,
          createdAt: lastMessage.createdAt.toISOString(),
        }
      : null,
    lastMessageAt: conversation.lastMessageAt.toISOString(),
    createdAt: conversation.createdAt.toISOString(),
  };
}
