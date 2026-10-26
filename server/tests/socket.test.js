import http from 'node:http';
import { io as connectClient } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { Message } from '../src/models/Message.js';
import { User } from '../src/models/User.js';
import { createSocketServer } from '../src/socket/index.js';
import { registerClient } from './helpers/clients.js';
import { clearTestDatabase, connectTestDatabase, disconnectTestDatabase } from './helpers/db.js';

const app = createApp();
let httpServer;
let io;
let baseUrl;
const openSockets = [];

let alice;
let bob;
let mallory;
let conversationId;

beforeAll(async () => {
  await connectTestDatabase();
  httpServer = http.createServer(app);
  io = createSocketServer(httpServer);
  app.set('io', io);
  await new Promise((resolve) => httpServer.listen(0, resolve));
  baseUrl = `http://localhost:${httpServer.address().port}`;
});

beforeEach(async () => {
  alice = await registerClient(app, { name: 'Alice' });
  bob = await registerClient(app, { name: 'Bob' });
  mallory = await registerClient(app, { name: 'Mallory' });
  const res = await alice.post('/api/conversations', { participantId: bob.user.id });
  conversationId = res.body.conversation.id;
});

afterEach(async () => {
  openSockets.splice(0).forEach((socket) => socket.disconnect());
  await clearTestDatabase();
});

afterAll(async () => {
  io.close();
  await new Promise((resolve) => httpServer.close(resolve));
  await disconnectTestDatabase();
});

function openSocket(headers = {}) {
  const socket = connectClient(baseUrl, {
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    extraHeaders: headers,
  });
  openSockets.push(socket);
  return socket;
}

/** Connects as a user and resolves once the server has joined the socket to its rooms. */
async function connectAs(client) {
  const socket = openSocket({ cookie: client.cookieHeader, origin: 'http://localhost:5173' });
  await waitForEvent(socket, 'session:ready');
  return socket;
}

function waitForEvent(socket, event, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for "${event}"`)),
      timeoutMs,
    );
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function collectEvents(socket, event) {
  const received = [];
  socket.on(event, (data) => received.push(data));
  return received;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function send(socket, payload) {
  return socket.timeout(3000).emitWithAck('message:send', payload);
}

describe('socket authentication', () => {
  it('rejects connections without a session cookie', async () => {
    const socket = openSocket();
    const error = await waitForEvent(socket, 'connect_error');
    expect(error.data).toEqual({ code: 'UNAUTHENTICATED' });
  });

  it('rejects connections with an invalid token', async () => {
    const socket = openSocket({ cookie: 'chat_token=not-a-real-token' });
    const error = await waitForEvent(socket, 'connect_error');
    expect(error.data.code).toBe('UNAUTHENTICATED');
  });

  it('rejects connections from origins that are not allowed', async () => {
    const socket = openSocket({ cookie: alice.cookieHeader, origin: 'https://evil.example' });
    await expect(waitForEvent(socket, 'connect_error')).resolves.toBeDefined();
    expect(socket.connected).toBe(false);
  });
});

describe('real-time messaging', () => {
  it('delivers a message to the other participant in real time after saving it', async () => {
    const aliceSocket = await connectAs(alice);
    const bobSocket = await connectAs(bob);
    const bobReceives = waitForEvent(bobSocket, 'message:new');

    const ack = await send(aliceSocket, {
      conversationId,
      content: '  Hi Bob!  ',
      clientMessageId: 'alice-msg-0001',
    });

    expect(ack.ok).toBe(true);
    expect(ack.message).toMatchObject({
      conversationId,
      senderId: alice.user.id,
      content: 'Hi Bob!',
      clientMessageId: 'alice-msg-0001',
    });

    const { message } = await bobReceives;
    expect(message.id).toBe(ack.message.id);

    // Persisted, and visible through the REST history endpoint (e.g. after a refresh).
    expect(await Message.exists({ _id: ack.message.id })).toBeTruthy();
    const history = await bob.get(`/api/conversations/${conversationId}/messages`);
    expect(history.body.messages.map((m) => m.content)).toEqual(['Hi Bob!']);
  });

  it("syncs the sender's other open tabs", async () => {
    const aliceTab1 = await connectAs(alice);
    const aliceTab2 = await connectAs(alice);
    const secondTabReceives = waitForEvent(aliceTab2, 'message:new');

    const ack = await send(aliceTab1, { conversationId, content: 'From tab one' });

    expect((await secondTabReceives).message.id).toBe(ack.message.id);
  });

  it('rejects empty and whitespace-only messages without storing them', async () => {
    const aliceSocket = await connectAs(alice);

    for (const content of ['', '    ', '\n\n']) {
      const ack = await send(aliceSocket, { conversationId, content });
      expect(ack).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Message cannot be empty' },
      });
    }
    expect(await Message.countDocuments()).toBe(0);
  });

  it('rejects malformed payloads', async () => {
    const aliceSocket = await connectAs(alice);

    const badId = await send(aliceSocket, { conversationId: 'nope', content: 'hi' });
    expect(badId.error.code).toBe('VALIDATION_ERROR');

    const tooLong = await send(aliceSocket, { conversationId, content: 'x'.repeat(2001) });
    expect(tooLong.error.code).toBe('VALIDATION_ERROR');

    const notAnObject = await send(aliceSocket, 'just a string');
    expect(notAnObject.ok).toBe(false);
  });

  it('prevents non-members from sending to or listening in on a conversation', async () => {
    const bobSocket = await connectAs(bob);
    const mallorySocket = await connectAs(mallory);
    const malloryInbox = collectEvents(mallorySocket, 'message:new');
    const bobInbox = collectEvents(bobSocket, 'message:new');

    const ack = await send(mallorySocket, { conversationId, content: 'Sneaky' });
    expect(ack).toMatchObject({ ok: false, error: { code: 'CONVERSATION_NOT_FOUND' } });

    const aliceSocket = await connectAs(alice);
    await send(aliceSocket, { conversationId, content: 'Private' });
    await delay(200);

    expect(bobInbox.map((event) => event.message.content)).toEqual(['Private']);
    expect(malloryInbox).toEqual([]);
    expect(await Message.countDocuments({ content: 'Sneaky' })).toBe(0);
  });

  it('does not store or broadcast duplicates when a send is retried', async () => {
    const aliceSocket = await connectAs(alice);
    const bobSocket = await connectAs(bob);
    const bobInbox = collectEvents(bobSocket, 'message:new');
    const payload = { conversationId, content: 'Retry me', clientMessageId: 'alice-retry-01' };

    const first = await send(aliceSocket, payload);
    const retry = await send(aliceSocket, payload);
    await delay(200);

    expect(retry.ok).toBe(true);
    expect(retry.message.id).toBe(first.message.id);
    expect(await Message.countDocuments()).toBe(1);
    expect(bobInbox).toHaveLength(1);
  });

  it('subscribes both users to a conversation created while they are connected', async () => {
    const malloryClient = mallory;
    const aliceSocket = await connectAs(alice);
    const mallorySocket = await connectAs(malloryClient);
    const conversationAnnounced = waitForEvent(mallorySocket, 'conversation:new');

    const res = await alice.post('/api/conversations', { participantId: malloryClient.user.id });
    const { conversation } = await conversationAnnounced;
    expect(conversation.id).toBe(res.body.conversation.id);

    const malloryReceives = waitForEvent(mallorySocket, 'message:new');
    await send(aliceSocket, { conversationId: conversation.id, content: 'Welcome!' });
    expect((await malloryReceives).message.content).toBe('Welcome!');
  });

  it('stores and delivers emoji messages unchanged', async () => {
    const aliceSocket = await connectAs(alice);
    const ack = await send(aliceSocket, { conversationId, content: 'Hi 👋 ❤️🔥' });
    expect(ack.message.content).toBe('Hi 👋 ❤️🔥');
  });

  it('delivers replies with a quote of the original message', async () => {
    const aliceSocket = await connectAs(alice);
    const bobSocket = await connectAs(bob);
    const bobInbox = collectEvents(bobSocket, 'message:new');
    const original = await send(aliceSocket, { conversationId, content: 'Lunch at 1?' });

    const reply = await send(aliceSocket, {
      conversationId,
      content: 'Or 2?',
      replyToId: original.message.id,
    });
    await delay(200);

    expect(reply.ok).toBe(true);
    const received = bobInbox.find((event) => event.message.id === reply.message.id);
    expect(received.message.replyTo).toEqual({
      id: original.message.id,
      senderId: alice.user.id,
      content: 'Lunch at 1?',
      deleted: false,
    });
  });

  it('rejects malformed reply ids', async () => {
    const aliceSocket = await connectAs(alice);
    const ack = await send(aliceSocket, { conversationId, content: 'Hi', replyToId: 'nope' });
    expect(ack.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('deleting', () => {
  it('tells both participants in real time when a message is deleted', async () => {
    const aliceSocket = await connectAs(alice);
    const bobSocket = await connectAs(bob);
    const mallorySocket = await connectAs(mallory);
    const malloryInbox = collectEvents(mallorySocket, 'message:deleted');
    const { message } = await send(aliceSocket, { conversationId, content: 'Delete me' });

    const bobNotified = waitForEvent(bobSocket, 'message:deleted');
    const aliceNotified = waitForEvent(aliceSocket, 'message:deleted');
    await alice.delete(`/api/conversations/${conversationId}/messages/${message.id}`);

    for (const event of [await bobNotified, await aliceNotified]) {
      expect(event.message).toMatchObject({ id: message.id, deleted: true, content: '' });
    }
    await delay(200);
    expect(malloryInbox).toEqual([]);
  });

  it("syncs a deleted chat to the user's other tabs but not to the other participant", async () => {
    const aliceTab = await connectAs(alice);
    const bobSocket = await connectAs(bob);
    const bobInbox = collectEvents(bobSocket, 'conversation:deleted');

    const aliceNotified = waitForEvent(aliceTab, 'conversation:deleted');
    await alice.delete(`/api/conversations/${conversationId}`);

    expect(await aliceNotified).toEqual({ conversationId });
    await delay(200);
    expect(bobInbox).toEqual([]);
  });
});

describe('presence', () => {
  it('tells chat partners when a user comes online and goes offline, and saves last seen', async () => {
    const bobSocket = await connectAs(bob);
    const mallorySocket = await connectAs(mallory);
    const malloryUpdates = collectEvents(mallorySocket, 'presence:update');

    const cameOnline = waitForEvent(bobSocket, 'presence:update');
    const aliceSocket = await connectAs(alice);
    expect(await cameOnline).toEqual({ userId: alice.user.id, online: true, lastSeenAt: null });

    const wentOffline = waitForEvent(bobSocket, 'presence:update');
    aliceSocket.disconnect();
    const offline = await wentOffline;
    expect(offline).toMatchObject({ userId: alice.user.id, online: false });
    expect(Date.parse(offline.lastSeenAt)).not.toBeNaN();

    await delay(200);
    expect(malloryUpdates).toEqual([]);
    const stored = await User.findById(alice.user.id).lean();
    expect(stored.lastSeenAt.toISOString()).toBe(offline.lastSeenAt);
  });

  it('stays online while the user still has another tab open', async () => {
    const bobSocket = await connectAs(bob);
    const aliceTab1 = await connectAs(alice);
    const aliceTab2 = await connectAs(alice);
    const bobUpdates = collectEvents(bobSocket, 'presence:update');

    aliceTab1.disconnect();
    await delay(200);
    expect(bobUpdates).toEqual([]);

    aliceTab2.disconnect();
    await delay(200);
    expect(bobUpdates).toMatchObject([{ userId: alice.user.id, online: false }]);
  });

  it('answers presence queries only about chat partners', async () => {
    await connectAs(bob);
    await connectAs(mallory);
    const aliceSocket = await connectAs(alice);
    const snapshot = waitForEvent(aliceSocket, 'presence:snapshot');

    aliceSocket.emit('presence:get', { userIds: [bob.user.id, mallory.user.id] });

    expect((await snapshot).presence).toEqual({
      [bob.user.id]: { online: true, lastSeenAt: null },
    });
  });
});

describe('typing indicators', () => {
  it("forwards typing to the conversation's other members only", async () => {
    const aliceSocket = await connectAs(alice);
    const bobSocket = await connectAs(bob);
    const mallorySocket = await connectAs(mallory);
    const malloryInbox = collectEvents(mallorySocket, 'typing');
    const bobReceives = waitForEvent(bobSocket, 'typing');

    aliceSocket.emit('typing', { conversationId, isTyping: true });

    expect(await bobReceives).toEqual({ conversationId, userId: alice.user.id, isTyping: true });
    await delay(200);
    expect(malloryInbox).toEqual([]);
  });

  it('ignores typing events from non-members and malformed payloads', async () => {
    const bobSocket = await connectAs(bob);
    const mallorySocket = await connectAs(mallory);
    const bobInbox = collectEvents(bobSocket, 'typing');

    mallorySocket.emit('typing', { conversationId, isTyping: true });
    mallorySocket.emit('typing', { conversationId: 'nope', isTyping: true });
    mallorySocket.emit('typing', 'not an object');
    await delay(200);

    expect(bobInbox).toEqual([]);
  });
});
