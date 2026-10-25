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

/** Returns { messages, hasMore, nextCursor }; pass `before` (a message id) for older pages. */
export async function listMessages(conversationId, { before } = {}) {
  const { data } = await api.get(`/conversations/${conversationId}/messages`, {
    params: { before },
  });
  return data;
}
