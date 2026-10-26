import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { registerClient } from './helpers/clients.js';
import { connectTestDatabase, disconnectTestDatabase } from './helpers/db.js';

const app = createApp();
let alice;

beforeAll(async () => {
  await connectTestDatabase();
  alice = await registerClient(app, { name: 'Alice Smith', email: 'alice@example.com' });
  await registerClient(app, { name: 'Bob Jones', username: 'bobby_j', email: 'bob@example.com' });
  await registerClient(app, { name: 'Carol Smith', username: 'mitthu', email: 'carol@work.io' });
});
afterAll(disconnectTestDatabase);

describe('GET /api/users', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  it('lists nobody until a username is searched', async () => {
    for (const url of [
      '/api/users',
      '/api/users?search=',
      `/api/users?search=${encodeURIComponent('@')}`,
    ]) {
      const res = await alice.get(url);
      expect(res.status).toBe(200);
      expect(res.body.users).toEqual([]);
    }
  });

  it('finds users whose username starts with the search, case-insensitively', async () => {
    const res = await alice.get('/api/users?search=BOB');

    expect(res.status).toBe(200);
    expect(res.body.users).toEqual([
      { id: expect.any(String), name: 'Bob Jones', username: 'bobby_j', email: 'bob@example.com' },
    ]);

    const withAt = await alice.get(`/api/users?search=${encodeURIComponent('@Mitt')}`);
    expect(withAt.body.users.map((user) => user.name)).toEqual(['Carol Smith']);
  });

  it('does not match names, emails, or the middle of a username', async () => {
    for (const search of ['Smith', 'carol', 'work.io', 'thu']) {
      const res = await alice.get(`/api/users?search=${encodeURIComponent(search)}`);
      expect(res.body.users).toEqual([]);
    }
  });

  it('excludes the current user', async () => {
    const res = await alice.get(`/api/users?search=${alice.user.username}`);
    expect(res.body.users).toEqual([]);
  });

  it('treats regex characters in the search literally', async () => {
    const res = await alice.get(`/api/users?search=${encodeURIComponent('.*')}`);
    expect(res.status).toBe(200);
    expect(res.body.users).toEqual([]);
  });

  it('validates the limit parameter', async () => {
    const res = await alice.get('/api/users?limit=500');
    expect(res.status).toBe(400);
    expect(res.body.error.details).toHaveProperty('limit');
  });
});
