import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/globalSetup.js'],
    testTimeout: 20_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      // Placeholder only: tests connect to the in-memory server started in globalSetup.
      MONGODB_URI: 'mongodb://placeholder.invalid/test',
      JWT_SECRET: 'test-only-secret-that-is-long-enough-1234567890',
      CLIENT_ORIGIN: 'http://localhost:5173',
      AUTH_RATE_LIMIT_MAX: '1000',
    },
  },
});
