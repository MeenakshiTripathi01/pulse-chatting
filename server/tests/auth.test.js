import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { buildUserData, createClient, registerClient } from './helpers/clients.js';
import {
  clearTestDatabase,
  connectTestDatabase,
  disconnectTestDatabase,
} from './helpers/db.js';

const app = createApp();

beforeAll(connectTestDatabase);
afterEach(clearTestDatabase);
afterAll(disconnectTestDatabase);

function getCookie(res, name) {
  return (res.headers['set-cookie'] ?? []).find((cookie) => cookie.startsWith(`${name}=`));
}

describe('POST /api/auth/register', () => {
  it('creates a user, hashes the password and sets an HttpOnly session cookie', async () => {
    const client = await createClient(app);
    const data = buildUserData({ name: '  Ada Lovelace ', email: '  Ada@Example.COM ' });

    const res = await client.post('/api/auth/register', data);

    expect(res.status).toBe(201);
    expect(res.body.user).toEqual({
      id: expect.any(String),
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    });
    expect(JSON.stringify(res.body)).not.toContain('password');

    const authCookie = getCookie(res, 'chat_token');
    expect(authCookie).toMatch(/HttpOnly/i);
    expect(authCookie).toMatch(/SameSite=Lax/i);

    const stored = await User.findOne({ email: 'ada@example.com' }).select('+passwordHash');
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(stored.passwordHash).not.toBe(data.password);
  });

  it('rejects a duplicate email regardless of letter case', async () => {
    await registerClient(app, { email: 'taken@example.com' });
    const client = await createClient(app);

    const res = await client.post(
      '/api/auth/register',
      buildUserData({ email: 'TAKEN@example.com' }),
    );

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
    expect(await User.countDocuments({ email: 'taken@example.com' })).toBe(1);
  });

  it('returns field-level validation errors', async () => {
    const client = await createClient(app);

    const res = await client.post('/api/auth/register', {
      name: 'A',
      email: 'not-an-email',
      password: 'short',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(res.body.error.details).sort()).toEqual(['email', 'name', 'password']);
  });

  it('requires a valid CSRF token', async () => {
    const withoutToken = await request(app).post('/api/auth/register').send(buildUserData());
    expect(withoutToken.status).toBe(403);
    expect(withoutToken.body.error.code).toBe('CSRF_INVALID');

    const client = await createClient(app);
    const wrongToken = await client.agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', 'a'.repeat(64))
      .send(buildUserData());
    expect(wrongToken.status).toBe(403);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials (email is case-insensitive)', async () => {
    const { credentials } = await registerClient(app, { email: 'login@example.com' });
    const client = await createClient(app);

    const res = await client.post('/api/auth/login', {
      email: 'LOGIN@example.com',
      password: credentials.password,
    });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('login@example.com');
    expect(getCookie(res, 'chat_token')).toBeDefined();

    const me = await client.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('login@example.com');
  });

  it('returns the same generic error for a wrong password and an unknown email', async () => {
    await registerClient(app, { email: 'real@example.com' });
    const client = await createClient(app);

    const wrongPassword = await client.post('/api/auth/login', {
      email: 'real@example.com',
      password: 'WrongPassword1',
    });
    const unknownEmail = await client.post('/api/auth/login', {
      email: 'ghost@example.com',
      password: 'Password123',
    });

    for (const res of [wrongPassword, unknownEmail]) {
      expect(res.status).toBe(401);
      expect(res.body.error).toMatchObject({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
      expect(getCookie(res, 'chat_token')).toBeUndefined();
    }
  });

  it('does not treat query operators as credentials (NoSQL injection)', async () => {
    await registerClient(app);
    const client = await createClient(app);

    const res = await client.post('/api/auth/login', {
      email: { $ne: null },
      password: { $ne: null },
    });

    expect(res.status).toBe(400);
  });
});

describe('protected routes and logout', () => {
  it('rejects /me without a session cookie', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a tampered token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', 'chat_token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.invalid-signature');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('rejects a valid token whose user no longer exists', async () => {
    const client = await registerClient(app);
    await User.deleteMany({});

    const res = await client.get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('clears the session on logout', async () => {
    const client = await registerClient(app);
    expect((await client.get('/api/auth/me')).status).toBe(200);

    const logoutRes = await client.post('/api/auth/logout');
    expect(logoutRes.status).toBe(204);
    expect(getCookie(logoutRes, 'chat_token')).toMatch(/Expires=Thu, 01 Jan 1970/);

    expect((await client.get('/api/auth/me')).status).toBe(401);
  });
});
