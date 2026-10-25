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
    expect(res.body.conversation.participants.map((p) => p.name).sort()).toEqual([
      'Alice',
      'Bob',
    ]);
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
    await sendMessage({ conversationId: conversation.id, senderId: alice.user.id, content: 'Secret' });

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
