import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 120_000, // first run downloads a MongoDB binary for mongodb-memory-server
    env: {
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://unused-in-tests',
      JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
    },
  },
});
