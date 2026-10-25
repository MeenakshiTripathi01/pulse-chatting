// End-to-end smoke test against a RUNNING server (local or deployed). It creates two
// throwaway users, so only point it at environments where that is acceptable.
//
// Usage: SMOKE_BASE_URL=http://localhost:5000 SMOKE_ORIGIN=http://localhost:5173 npm run smoke
import { randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';

const BASE_URL = (process.env.SMOKE_BASE_URL ?? 'http://localhost:5000').replace(/\/$/, '');
const ORIGIN = process.env.SMOKE_ORIGIN ?? 'http://localhost:5173';

/** A minimal "browser": remembers cookies and the CSRF token between requests. */
function createBrowser() {
  const cookies = new Map();
  let csrfToken = null;

  const cookieHeader = () => [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');

  async function request(method, path, body) {
    const headers = { Origin: ORIGIN, Cookie: cookieHeader() };
    if (body) headers['Content-Type'] = 'application/json';
    if (csrfToken && method !== 'GET') headers['X-CSRF-Token'] = csrfToken;

    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    for (const cookie of res.headers.getSetCookie()) {
      const [pair] = cookie.split(';');
      const [name, ...rest] = pair.split('=');
      cookies.set(name.trim(), rest.join('='));
    }
    const data = res.status === 204 ? null : await res.json();
    return { status: res.status, data };
  }

  return {
    request,
    cookieHeader,
    async init() {
      csrfToken = (await request('GET', '/api/auth/csrf')).data.csrfToken;
    },
  };
}

function check(condition, label) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  console.log(`  ok - ${label}`);
}

function waitFor(socket, event, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeoutMs);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

async function main() {
  console.log(`Smoke testing ${BASE_URL} (origin ${ORIGIN})`);
  const runId = randomUUID().slice(0, 8);

  const health = await (await fetch(`${BASE_URL}/api/health`)).json();
  check(health.status === 'ok' && health.database === 'connected', 'health check reports DB connected');

  const alice = createBrowser();
  const bob = createBrowser();
  await alice.init();
  await bob.init();

  const aliceReg = await alice.request('POST', '/api/auth/register', {
    name: 'Smoke Alice',
    email: `smoke-alice-${runId}@example.com`,
    password: 'Password123',
  });
  check(aliceReg.status === 201, 'Alice registers');
  const bobReg = await bob.request('POST', '/api/auth/register', {
    name: 'Smoke Bob',
    email: `smoke-bob-${runId}@example.com`,
    password: 'Password123',
  });
  check(bobReg.status === 201, 'Bob registers');

  const me = await alice.request('GET', '/api/auth/me');
  check(me.status === 200 && me.data.user.name === 'Smoke Alice', 'session cookie authenticates /me');

  const search = await alice.request('GET', `/api/users?search=${encodeURIComponent(`smoke-bob-${runId}`)}`);
  check(search.data.users.length === 1, 'Alice finds Bob in the user directory');

  const convo = await alice.request('POST', '/api/conversations', {
    participantId: search.data.users[0].id,
  });
  check(convo.status === 201, 'Alice starts a conversation with Bob');
  const conversationId = convo.data.conversation.id;

  const socketOptions = (browser) => ({
    transports: ['websocket'],
    reconnection: false,
    extraHeaders: { Cookie: browser.cookieHeader(), Origin: ORIGIN },
  });
  const aliceSocket = io(BASE_URL, socketOptions(alice));
  const bobSocket = io(BASE_URL, socketOptions(bob));

  try {
    await Promise.all([waitFor(aliceSocket, 'session:ready'), waitFor(bobSocket, 'session:ready')]);
    check(true, 'both sockets authenticated and joined their rooms');

    const bobReceives = waitFor(bobSocket, 'message:new');
    const ack = await aliceSocket.timeout(5000).emitWithAck('message:send', {
      conversationId,
      content: 'Hello from the smoke test',
      clientMessageId: `smoke-${runId}-1`,
    });
    check(ack.ok === true, 'Alice gets a saved-message acknowledgement');
    const delivered = await bobReceives;
    check(delivered.message.id === ack.message.id, 'Bob receives the message in real time');

    const aliceReceives = waitFor(aliceSocket, 'message:new');
    const reply = await bobSocket.timeout(5000).emitWithAck('message:send', {
      conversationId,
      content: 'Reply from Bob',
    });
    check(reply.ok && (await aliceReceives).message.content === 'Reply from Bob', 'Bob replies and Alice receives it');

    const empty = await aliceSocket.timeout(5000).emitWithAck('message:send', {
      conversationId,
      content: '   ',
    });
    check(empty.ok === false && empty.error.code === 'VALIDATION_ERROR', 'empty messages are rejected');

    const history = await bob.request('GET', `/api/conversations/${conversationId}/messages`);
    check(
      history.data.messages.map((m) => m.content).join('|') ===
        'Hello from the smoke test|Reply from Bob',
      'history endpoint returns both persisted messages in order',
    );

    const list = await alice.request('GET', '/api/conversations');
    check(list.data.conversations[0].lastMessage?.content === 'Reply from Bob', 'conversation preview shows the latest message');

    const logout = await alice.request('POST', '/api/auth/logout');
    check(logout.status === 204, 'Alice logs out');
    check((await alice.request('GET', '/api/auth/me')).status === 401, 'logged-out session is rejected');
  } finally {
    aliceSocket.disconnect();
    bobSocket.disconnect();
  }

  console.log('Smoke test passed.');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
