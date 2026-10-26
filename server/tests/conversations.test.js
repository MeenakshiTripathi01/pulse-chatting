import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { Conversation } from '../src/models/Conversation.js';
import { sendMessage } from '../src/services/messageService.js';
import { registerClient } from './helpers/clients.js';
import { clearTestDatabase, connectTestDatabase, disconnectTestDatabase } from './helpers/db.js';

const app = createApp();
let alice;
let bob;
let mallory;

beforeAll(connectTestDatabase);
beforeEach(async () => {
  alice = await registerClient(app, { name: 'Alice' });
  bob = await registerClient(app, { name: 'Bob' });
  mallory = await registerClient(app, { name: 'Mallory' });
});
afterEach(clearTestDatabase);
afterAll(disconnectTestDatabase);

async function startConversation(client, other) {
  const res = await client.post('/api/conversations', { participantId: other.user.id });
  return res.body.conversation;
}

describe('POST /api/conversations', () => {
  it('creates a direct conversation between two users', async () => {
    const res = await alice.post('/api/conversations', { participantId: bob.user.id });

    expect(res.status).toBe(201);
    expect(res.body.conversation).toMatchObject({
      id: expect.any(String),
      type: 'direct',
      lastMessage: null,
    });
    expect(res.body.conversation.participants.map((p) => p.name).sort()).toEqual(['Alice', 'Bob']);
  });

  it('returns the existing conversation instead of creating a duplicate (either direction)', async () => {
    const first = await alice.post('/api/conversations', { participantId: bob.user.id });
    const second = await bob.post('/api/conversations', { participantId: alice.user.id });

    expect(second.status).toBe(200);
    expect(second.body.conversation.id).toBe(first.body.conversation.id);
    expect(await Conversation.countDocuments()).toBe(1);
  });

  it('handles simultaneous creation without duplicates', async () => {
    const results = await Promise.all([
      alice.post('/api/conversations', { participantId: bob.user.id }),
      bob.post('/api/conversations', { participantId: alice.user.id }),
    ]);

    expect(results.map((res) => res.status).sort()).toEqual([200, 201]);
    expect(await Conversation.countDocuments()).toBe(1);
  });

  it('rejects starting a conversation with yourself', async () => {
    const res = await alice.post('/api/conversations', { participantId: alice.user.id });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PARTICIPANT');
  });

  it('rejects unknown users and malformed ids', async () => {
    const unknown = await alice.post('/api/conversations', {
      participantId: new mongoose.Types.ObjectId().toString(),
    });
    expect(unknown.status).toBe(404);

    const malformed = await alice.post('/api/conversations', { participantId: 'abc' });
    expect(malformed.status).toBe(400);
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/conversations');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/conversations', () => {
  it('lists only my conversations, most recent activity first, with previews', async () => {
    const withBob = await startConversation(alice, bob);
    const withMallory = await startConversation(alice, mallory);
    await startConversation(bob, mallory); // Alice is not part of this one

    await sendMessage({
      conversationId: withBob.id,
      senderId: bob.user.id,
      content: 'Latest news',
    });

    const res = await alice.get('/api/conversations');

    expect(res.status).toBe(200);
    expect(res.body.conversations.map((c) => c.id)).toEqual([withBob.id, withMallory.id]);
    expect(res.body.conversations[0].lastMessage).toMatchObject({
      content: 'Latest news',
      senderId: bob.user.id,
    });
  });
});

describe('conversation authorization', () => {
  it('hides a conversation and its messages from non-members', async () => {
    const conversation = await startConversation(alice, bob);
    await sendMessage({
      conversationId: conversation.id,
      senderId: alice.user.id,
      content: 'Secret',
    });

    const details = await mallory.get(`/api/conversations/${conversation.id}`);
    const messages = await mallory.get(`/api/conversations/${conversation.id}/messages`);

    for (const res of [details, messages]) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('CONVERSATION_NOT_FOUND');
      expect(JSON.stringify(res.body)).not.toContain('Secret');
    }
  });

  it('lets members fetch conversation details', async () => {
    const conversation = await startConversation(alice, bob);
    const res = await bob.get(`/api/conversations/${conversation.id}`);
    expect(res.status).toBe(200);
    expect(res.body.conversation.id).toBe(conversation.id);
  });
});

describe('GET /api/conversations/:id/messages', () => {
  it('returns persisted history with cursor pagination in chronological order', async () => {
    const conversation = await startConversation(alice, bob);
    for (let i = 1; i <= 5; i += 1) {
      await sendMessage({
        conversationId: conversation.id,
        senderId: i % 2 ? alice.user.id : bob.user.id,
        content: `Message ${i}`,
      });
    }

    const firstPage = await bob.get(`/api/conversations/${conversation.id}/messages?limit=3`);
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.messages.map((m) => m.content)).toEqual([
      'Message 3',
      'Message 4',
      'Message 5',
    ]);
    expect(firstPage.body.hasMore).toBe(true);
    expect(firstPage.body.messages[0]).toMatchObject({
      conversationId: conversation.id,
      senderId: alice.user.id,
      createdAt: expect.any(String),
    });

    const secondPage = await bob.get(
      `/api/conversations/${conversation.id}/messages?limit=3&before=${firstPage.body.nextCursor}`,
    );
    expect(secondPage.body.messages.map((m) => m.content)).toEqual(['Message 1', 'Message 2']);
    expect(secondPage.body.hasMore).toBe(false);
    expect(secondPage.body.nextCursor).toBeNull();
  });

  it('rejects a cursor from another conversation', async () => {
    const withBob = await startConversation(alice, bob);
    const withMallory = await startConversation(alice, mallory);
    const { message } = await sendMessage({
      conversationId: withMallory.id,
      senderId: alice.user.id,
      content: 'Hi Mallory',
    });

    const res = await alice.get(`/api/conversations/${withBob.id}/messages?before=${message.id}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CURSOR');
  });
});

describe('DELETE /api/conversations/:id', () => {
  it('removes the chat and its history for me only, and new messages bring it back', async () => {
    const conversation = await startConversation(alice, bob);
    await sendMessage({ conversationId: conversation.id, senderId: bob.user.id, content: 'Old' });

    const res = await alice.delete(`/api/conversations/${conversation.id}`);
    expect(res.status).toBe(204);

    expect((await alice.get('/api/conversations')).body.conversations).toEqual([]);
    const aliceHistory = await alice.get(`/api/conversations/${conversation.id}/messages`);
    expect(aliceHistory.body.messages).toEqual([]);
    const details = await alice.get(`/api/conversations/${conversation.id}`);
    expect(details.body.conversation.lastMessage).toBeNull();

    // Bob still has everything.
    const bobHistory = await bob.get(`/api/conversations/${conversation.id}/messages`);
    expect(bobHistory.body.messages.map((m) => m.content)).toEqual(['Old']);
    expect((await bob.get('/api/conversations')).body.conversations).toHaveLength(1);

    await sendMessage({ conversationId: conversation.id, senderId: bob.user.id, content: 'New' });

    const list = await alice.get('/api/conversations');
    expect(list.body.conversations.map((c) => c.lastMessage.content)).toEqual(['New']);
    const newHistory = await alice.get(`/api/conversations/${conversation.id}/messages`);
    expect(newHistory.body.messages.map((m) => m.content)).toEqual(['New']);
  });

  it('can be repeated without duplicating state', async () => {
    const conversation = await startConversation(alice, bob);
    await alice.delete(`/api/conversations/${conversation.id}`);
    await alice.delete(`/api/conversations/${conversation.id}`);

    const stored = await Conversation.findById(conversation.id).lean();
    expect(stored.clearedBy).toHaveLength(1);
  });

  it('returns 404 to non-members', async () => {
    const conversation = await startConversation(alice, bob);
    const res = await mallory.delete(`/api/conversations/${conversation.id}`);
    expect(res.status).toBe(404);
  });

  it('never exposes who cleared a chat', async () => {
    const conversation = await startConversation(alice, bob);
    await alice.delete(`/api/conversations/${conversation.id}`);
    const res = await bob.get(`/api/conversations/${conversation.id}`);
    expect(res.body.conversation).not.toHaveProperty('clearedBy');
  });
});

describe('DELETE /api/conversations/:id/messages/:messageId', () => {
  it('lets the sender delete a message for everyone and updates quotes and the preview', async () => {
    const conversation = await startConversation(alice, bob);
    const { message: original } = await sendMessage({
      conversationId: conversation.id,
      senderId: alice.user.id,
      content: 'Oops, wrong chat',
    });
    const { message: reply } = await sendMessage({
      conversationId: conversation.id,
      senderId: bob.user.id,
      content: 'What?',
      replyToId: original.id,
    });
    expect(reply.replyTo).toEqual({
      id: original.id,
      senderId: alice.user.id,
      content: 'Oops, wrong chat',
      deleted: false,
    });

    const res = await alice.delete(`/api/conversations/${conversation.id}/messages/${original.id}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatchObject({ id: original.id, deleted: true, content: '' });

    const history = await bob.get(`/api/conversations/${conversation.id}/messages`);
    expect(JSON.stringify(history.body)).not.toContain('wrong chat');
    expect(history.body.messages[0]).toMatchObject({ deleted: true, content: '' });
    expect(history.body.messages[1].replyTo).toMatchObject({ deleted: true, content: '' });
  });

  it('marks the conversation preview as deleted when the newest message is deleted', async () => {
    const conversation = await startConversation(alice, bob);
    const { message } = await sendMessage({
      conversationId: conversation.id,
      senderId: alice.user.id,
      content: 'Secret preview',
    });

    await alice.delete(`/api/conversations/${conversation.id}/messages/${message.id}`);

    const list = await bob.get('/api/conversations');
    expect(list.body.conversations[0].lastMessage).toMatchObject({ deleted: true, content: '' });
    expect(JSON.stringify(list.body)).not.toContain('Secret preview');
  });

  it("refuses to delete someone else's message or a message from another conversation", async () => {
    const conversation = await startConversation(alice, bob);
    const { message } = await sendMessage({
      conversationId: conversation.id,
      senderId: bob.user.id,
      content: "Bob's words",
    });

    const notMine = await alice.delete(
      `/api/conversations/${conversation.id}/messages/${message.id}`,
    );
    expect(notMine.status).toBe(403);
    expect(notMine.body.error.code).toBe('NOT_MESSAGE_SENDER');

    const outsider = await mallory.delete(
      `/api/conversations/${conversation.id}/messages/${message.id}`,
    );
    expect(outsider.status).toBe(404);

    const withMallory = await startConversation(alice, mallory);
    const wrongConversation = await bob.delete(
      `/api/conversations/${withMallory.id}/messages/${message.id}`,
    );
    expect(wrongConversation.status).toBe(404);

    const history = await bob.get(`/api/conversations/${conversation.id}/messages`);
    expect(history.body.messages[0]).toMatchObject({ content: "Bob's words", deleted: false });
  });
});

describe('replies', () => {
  it('rejects replies to deleted messages or messages in another conversation', async () => {
    const withBob = await startConversation(alice, bob);
    const withMallory = await startConversation(alice, mallory);
    const { message: elsewhere } = await sendMessage({
      conversationId: withMallory.id,
      senderId: mallory.user.id,
      content: 'Private to Alice',
    });

    await expect(
      sendMessage({
        conversationId: withBob.id,
        senderId: bob.user.id,
        content: 'Quoting',
        replyToId: elsewhere.id,
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_REPLY' });

    const { message: gone } = await sendMessage({
      conversationId: withBob.id,
      senderId: alice.user.id,
      content: 'Soon gone',
    });
    await alice.delete(`/api/conversations/${withBob.id}/messages/${gone.id}`);

    await expect(
      sendMessage({
        conversationId: withBob.id,
        senderId: bob.user.id,
        content: 'Quoting',
        replyToId: gone.id,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_REPLY' });
  });
});
