import { api } from './client.js';

export async function listConversations() {
  const { data } = await api.get('/conversations');
  return data.conversations;
}

export async function getConversation(conversationId) {
  const { data } = await api.get(`/conversations/${conversationId}`);
  return data.conversation;
}

export async function createConversation(participantId) {
  const { data } = await api.post('/conversations', { participantId });
  return data.conversation;
}

/** Removes the conversation and its history from the current user's list only. */
export async function deleteConversation(conversationId) {
  await api.delete(`/conversations/${conversationId}`);
}

/** Deletes one of the current user's messages for everyone; returns the updated message. */
export async function deleteMessage(conversationId, messageId) {
  const { data } = await api.delete(`/conversations/${conversationId}/messages/${messageId}`);
  return data.message;
}

/** Returns { messages, hasMore, nextCursor }; pass `before` (a message id) for older pages. */
export async function listMessages(conversationId, { before } = {}) {
  const { data } = await api.get(`/conversations/${conversationId}/messages`, {
    params: { before },
  });
  return data;
}
