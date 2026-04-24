import { createServer } from 'http';
import app from './app.js';
import { connectDB, disconnectDB } from './config/db.js';
import { initializeSocket } from './socket/index.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

async function start() {
  await connectDB();

  const httpServer = createServer(app);
  initializeSocket(httpServer);

  httpServer.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Server running');
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    await disconnectDB();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((err) => logger.error({ err }, 'Failed to start server'));
