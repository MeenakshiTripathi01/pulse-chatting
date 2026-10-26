import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { buildUserData, createClient, registerClient } from './helpers/clients.js';
import { clearTestDatabase, connectTestDatabase, disconnectTestDatabase } from './helpers/db.js';

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
    const data = buildUserData({
      name: '  Ada Lovelace ',
      username: ' Ada.L ',
      email: '  Ada@Example.COM ',
    });

    const res = await client.post('/api/auth/register', data);

    expect(res.status).toBe(201);
    expect(res.body.user).toEqual({
      id: expect.any(String),
      name: 'Ada Lovelace',
      username: 'ada.l',
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

  it('rejects a username that is already taken, regardless of letter case', async () => {
    await registerClient(app, { username: 'taken_name' });
    const client = await createClient(app);

    const res = await client.post('/api/auth/register', buildUserData({ username: 'Taken_Name' }));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('USERNAME_TAKEN');
  });

  it('returns field-level validation errors', async () => {
    const client = await createClient(app);

    const res = await client.post('/api/auth/register', {
      name: 'A',
      username: 'no spaces!',
      email: 'not-an-email',
      password: 'short',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(res.body.error.details).sort()).toEqual([
      'email',
      'name',
      'password',
      'username',
    ]);
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

  it('rejects a wrong password for an existing email', async () => {
    await registerClient(app, { email: 'real@example.com' });
    const client = await createClient(app);

    const res = await client.post('/api/auth/login', {
      email: 'real@example.com',
      password: 'WrongPassword1',
    });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('WRONG_PASSWORD');
    expect(getCookie(res, 'chat_token')).toBeUndefined();
    expect(await User.countDocuments({ email: 'real@example.com' })).toBe(1);
  });

  it('creates an account for a new email, then logs back into the same account', async () => {
    const client = await createClient(app);

    const first = await client.post('/api/auth/login', {
      email: 'Meenakshi.Tripathi01@Example.com',
      password: 'Password123',
      username: 'Meenakshi_T',
    });

    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({
      created: true,
      user: {
        name: 'Meenakshi Tripathi01',
        username: 'meenakshi_t',
        email: 'meenakshi.tripathi01@example.com',
      },
    });
    expect(getCookie(first, 'chat_token')).toBeDefined();
    expect((await client.get('/api/auth/me')).body.user.id).toBe(first.body.user.id);

    const stored = await User.findOne({ email: 'meenakshi.tripathi01@example.com' }).select(
      '+passwordHash',
    );
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);

    const again = await (
      await createClient(app)
    ).post('/api/auth/login', {
      email: 'meenakshi.tripathi01@example.com',
      password: 'Password123',
    });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ created: false, user: { id: first.body.user.id } });
  });

  it('applies new-password rules before creating an account', async () => {
    const client = await createClient(app);

    const res = await client.post('/api/auth/login', {
      email: 'newbie@example.com',
      password: 'short',
      username: 'newbie',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toHaveProperty('password');
    expect(getCookie(res, 'chat_token')).toBeUndefined();
    expect(await User.countDocuments({ email: 'newbie@example.com' })).toBe(0);
  });

  it('requires an available username to create an account', async () => {
    await registerClient(app, { username: 'popular' });
    const client = await createClient(app);
    const newAccount = { email: 'newbie@example.com', password: 'Password123' };

    const missing = await client.post('/api/auth/login', { ...newAccount, username: '' });
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('USERNAME_REQUIRED');
    expect(missing.body.error.details).toHaveProperty('username');

    const taken = await client.post('/api/auth/login', { ...newAccount, username: 'Popular' });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe('USERNAME_TAKEN');

    expect(await User.countDocuments({ email: 'newbie@example.com' })).toBe(0);
  });

  it('adds a username to an older account that has none', async () => {
    const { credentials } = await registerClient(app, { email: 'old@example.com' });
    await User.updateOne({ email: 'old@example.com' }, { $unset: { username: 1 } });
    const client = await createClient(app);

    const res = await client.post('/api/auth/login', {
      email: 'old@example.com',
      password: credentials.password,
      username: 'old_timer',
    });

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('old_timer');
    expect((await User.findOne({ email: 'old@example.com' })).username).toBe('old_timer');
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
