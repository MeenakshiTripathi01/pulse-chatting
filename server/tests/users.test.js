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
  await registerClient(app, { name: 'Bob Jones', email: 'bob@example.com' });
  await registerClient(app, { name: 'Carol Smith', email: 'carol@work.io' });
});
afterAll(disconnectTestDatabase);

describe('GET /api/users', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  it('lists other users alphabetically and excludes the current user', async () => {
    const res = await alice.get('/api/users');

    expect(res.status).toBe(200);
    expect(res.body.users.map((user) => user.name)).toEqual(['Bob Jones', 'Carol Smith']);
    expect(res.body.users[0]).toEqual({
      id: expect.any(String),
      name: 'Bob Jones',
      email: 'bob@example.com',
    });
  });

  it('searches by name or email, case-insensitively', async () => {
    const byName = await alice.get('/api/users?search=SMITH');
    expect(byName.body.users.map((user) => user.name)).toEqual(['Carol Smith']);

    const byEmail = await alice.get('/api/users?search=work.io');
    expect(byEmail.body.users.map((user) => user.name)).toEqual(['Carol Smith']);
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
