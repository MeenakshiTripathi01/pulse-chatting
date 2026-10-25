import { MongoMemoryServer } from 'mongodb-memory-server';

let mongoServer;

export async function setup({ provide }) {
  mongoServer = await MongoMemoryServer.create();
  provide('mongoUri', mongoServer.getUri());
}

export async function teardown() {
  await mongoServer?.stop();
}
