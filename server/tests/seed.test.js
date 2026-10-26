import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_PASSWORD, seedDemoData } from '../scripts/seed.js';
import { createApp } from '../src/app.js';
import { Conversation } from '../src/models/Conversation.js';
import { Message } from '../src/models/Message.js';
import { User } from '../src/models/User.js';
import { createClient } from './helpers/clients.js';
import { connectTestDatabase, disconnectTestDatabase } from './helpers/db.js';

const app = createApp();

beforeAll(connectTestDatabase);
afterAll(disconnectTestDatabase);

describe('seed script (development only)', () => {
  it('creates real, loginable demo accounts and is safe to run repeatedly', async () => {
    const first = await seedDemoData();
    const second = await seedDemoData();

    expect(first).toMatchObject({ usersCreated: 2, messagesCreated: 2 });
    expect(second).toMatchObject({ usersCreated: 0, messagesCreated: 0 });
    expect(second.conversationId).toBe(first.conversationId);
    expect(await User.countDocuments()).toBe(2);
    expect(await Conversation.countDocuments()).toBe(1);
    expect(await Message.countDocuments()).toBe(2);

    // Demo users go through the normal auth path: hashed password, real login.
    const client = await createClient(app);
    const login = await client.post('/api/auth/login', {
      email: 'alice@demo.com',
      password: DEMO_PASSWORD,
    });
    expect(login.status).toBe(200);
    const stored = await User.findOne({ email: 'alice@demo.com' }).select('+passwordHash');
    expect(stored.passwordHash).not.toBe(DEMO_PASSWORD);
  });

  it('does not reset the password of an existing account', async () => {
    await User.deleteMany({});
    const client = await createClient(app);
    await client.post('/api/auth/register', {
      name: 'Real Alice',
      email: 'alice@demo.com',
      password: 'MyOwnPassword9',
    });

    await seedDemoData();

    const login = await (
      await createClient(app)
    ).post('/api/auth/login', {
      email: 'alice@demo.com',
      password: 'MyOwnPassword9',
    });
    expect(login.status).toBe(200);
  });
});
