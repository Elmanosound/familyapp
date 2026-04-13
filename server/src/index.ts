import { createServer } from 'http';
import app from './app.js';
import { connectDB, disconnectDB } from './config/db.js';
import { initializeSocket } from './socket/index.js';
import { env } from './config/env.js';

async function start() {
  await connectDB();

  const httpServer = createServer(app);
  initializeSocket(httpServer);

  httpServer.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down...');
    await disconnectDB();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch(console.error);
