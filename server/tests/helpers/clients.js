import { randomUUID } from 'node:crypto';
import request from 'supertest';

/**
 * A supertest "agent" behaves like one browser: it keeps cookies between requests.
 * This helper also fetches a CSRF token and attaches it to every state-changing request.
 */
export async function createClient(app) {
  const agent = request.agent(app);
  const csrfResponse = await agent.get('/api/auth/csrf');
  const { csrfToken } = csrfResponse.body;

  return {
    agent,
    csrfToken,
    get: (url) => agent.get(url),
    post: (url, body) => agent.post(url).set('X-CSRF-Token', csrfToken).send(body),
  };
}

export function buildUserData(overrides = {}) {
  return {
    name: 'Test User',
    username: `user_${randomUUID().replaceAll('-', '').slice(0, 12)}`,
    email: `user-${randomUUID()}@example.com`,
    password: 'Password123',
    ...overrides,
  };
}

/** Registers a new user and returns a logged-in client plus a raw Cookie header for sockets. */
export async function registerClient(app, overrides = {}) {
  const client = await createClient(app);
  const credentials = buildUserData(overrides);
  const res = await client.post('/api/auth/register', credentials);

  if (res.status !== 201) {
    throw new Error(`Registration failed (${res.status}): ${JSON.stringify(res.body)}`);
  }

  const cookieHeader = res.headers['set-cookie'].map((cookie) => cookie.split(';')[0]).join('; ');

  return { ...client, user: res.body.user, credentials, cookieHeader };
}
