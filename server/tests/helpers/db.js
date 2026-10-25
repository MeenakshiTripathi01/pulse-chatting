import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { inject } from 'vitest';

/** Connects to a fresh, uniquely named database on the shared in-memory MongoDB server. */
export async function connectTestDatabase() {
  const baseUri = inject('mongoUri');
  await mongoose.connect(baseUri, { dbName: `test-${randomUUID()}` });
  await mongoose.connection.syncIndexes();
}

export async function clearTestDatabase() {
  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
}

export async function disconnectTestDatabase() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}
