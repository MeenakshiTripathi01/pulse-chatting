// Optional development data: two demo accounts and a short sample conversation.
// Never part of the production flow; refuses to run when NODE_ENV=production.
//
// Usage (from the repo root): npm run seed
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { config } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { Message } from '../src/models/Message.js';
import { User } from '../src/models/User.js';
import { registerUser } from '../src/services/authService.js';
import { findOrCreateDirectConversation } from '../src/services/conversationService.js';
import { sendMessage } from '../src/services/messageService.js';

export const DEMO_PASSWORD = 'Password123';
export const DEMO_USERS = [
  { name: 'Alice Demo', username: 'alice', email: 'alice@demo.com' },
  { name: 'Bob Demo', username: 'bob', email: 'bob@demo.com' },
];

async function findOrRegister({ name, username, email }) {
  // Existing accounts are left untouched (their passwords are never reset).
  const existing = await User.findOne({ email });
  if (existing) return { user: existing, created: false };
  return {
    user: await registerUser({ name, username, email, password: DEMO_PASSWORD }),
    created: true,
  };
}

/** Idempotent: running it again does not create duplicate users, chats or messages. */
export async function seedDemoData() {
  if (config.isProduction) {
    throw new Error('Refusing to seed demo data when NODE_ENV=production.');
  }

  const [alice, bob] = await Promise.all(DEMO_USERS.map(findOrRegister));
  const { conversation } = await findOrCreateDirectConversation(alice.user._id, bob.user._id);

  let messagesCreated = 0;
  if (!(await Message.exists({ conversation: conversation.id }))) {
    await sendMessage({
      conversationId: conversation.id,
      senderId: alice.user._id,
      content: 'Hi Bob! This is a seeded demo conversation.',
    });
    await sendMessage({
      conversationId: conversation.id,
      senderId: bob.user._id,
      content: 'Hi Alice! Log in as either of us to try real-time chat.',
    });
    messagesCreated = 2;
  }

  return {
    usersCreated: [alice, bob].filter((result) => result.created).length,
    conversationId: conversation.id,
    messagesCreated,
  };
}

async function main() {
  await connectDatabase(config.mongoUri);
  const database = mongoose.connection.name;
  const result = await seedDemoData();

  console.log(
    `[seed] Database "${database}": ${result.usersCreated} user(s) created, ` +
      `${result.messagesCreated} message(s) created.`,
  );
  console.log('[seed] Demo logins (development only):');
  for (const { email } of DEMO_USERS) console.log(`         ${email} / ${DEMO_PASSWORD}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((error) => {
      console.error(`[seed] Failed: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(disconnectDatabase);
}
