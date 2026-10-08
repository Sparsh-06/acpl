import mongoose from 'mongoose';
import { createApp } from './app.js';
import { env } from './config/env.js';

async function main() {
  await mongoose.connect(env.MONGODB_URI);
  await mongoose.syncIndexes();
  console.log('Connected to MongoDB');

  const server = createApp().listen(env.PORT, () => {
    console.log(`API listening on http://localhost:${env.PORT}`);
  });

  const shutdown = async () => {
    server.close();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
