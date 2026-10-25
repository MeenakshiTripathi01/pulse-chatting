import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { Conversation } from '../src/models/Conversation.js';
import { Message } from '../src/models/Message.js';
import { sendMessage } from '../src/services/messageService.js';
import { registerClient } from './helpers/clients.js';
import { clearTestDatabase, connectTestDatabase, disconnectTestDatabase } from './helpers/db.js';

const app = createApp();
let alice;
let bob;
let mallory;
let conversationId;

beforeAll(connectTestDatabase);
beforeEach(async () => {
  alice = await registerClient(app);
  bob = await registerClient(app);
  mallory = await registerClient(app);
  const res = await alice.post('/api/conversations', { participantId: bob.user.id });
  conversationId = res.body.conversation.id;
});
afterEach(clearTestDatabase);
afterAll(disconnectTestDatabase);

describe('sendMessage', () => {
  it('persists the message and updates the conversation preview', async () => {
    const { message, duplicate } = await sendMessage({
      conversationId,
      senderId: alice.user.id,
      content: 'Hello Bob',
    });

    expect(duplicate).toBe(false);
    expect(message).toMatchObject({ conversationId, senderId: alice.user.id, content: 'Hello Bob' });

    const stored = await Message.findById(message.id).lean();
    expect(stored.content).toBe('Hello Bob');

    const conversation = await Conversation.findById(conversationId).lean();
    expect(conversation.lastMessage.content).toBe('Hello Bob');
    expect(conversation.lastMessageAt.toISOString()).toBe(message.createdAt);
  });

  it('refuses senders who are not members and stores nothing', async () => {
    await expect(
      sendMessage({ conversationId, senderId: mallory.user.id, content: 'Let me in' }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'CONVERSATION_NOT_FOUND' });

    expect(await Message.countDocuments()).toBe(0);
  });

  it('is idempotent for retries with the same clientMessageId', async () => {
    const input = {
      conversationId,
      senderId: alice.user.id,
      content: 'Only once please',
      clientMessageId: 'client-message-0001',
    };

    const first = await sendMessage(input);
    const retry = await sendMessage(input);

    expect(retry.duplicate).toBe(true);
    expect(retry.message.id).toBe(first.message.id);
    expect(await Message.countDocuments()).toBe(1);
  });

  it('rejects reusing a clientMessageId in a different conversation', async () => {
    const other = await alice.post('/api/conversations', { participantId: mallory.user.id });
    const clientMessageId = 'client-message-0002';

    await sendMessage({ conversationId, senderId: alice.user.id, content: 'A', clientMessageId });

    await expect(
      sendMessage({
        conversationId: other.body.conversation.id,
        senderId: alice.user.id,
        content: 'B',
        clientMessageId,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
