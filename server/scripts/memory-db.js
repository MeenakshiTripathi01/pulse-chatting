// Starts a throwaway MongoDB on 127.0.0.1:27017 for local experiments, no install needed.
// All data is lost when this process stops. Use a real MongoDB (e.g. Atlas) for anything else.
import { MongoMemoryServer } from 'mongodb-memory-server';

const port = Number(process.env.MEMORY_DB_PORT ?? 27017);
const server = await MongoMemoryServer.create({ instance: { port, ip: '127.0.0.1' } });

console.log(`[memory-db] MongoDB running at ${server.getUri()}realtime-chat`);
console.log('[memory-db] Data is NOT persisted. Press Ctrl+C to stop.');

const stop = async () => {
  await server.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
