import { createServer } from 'http';
import cron from 'node-cron';
import app from './app.js';
import { connectDB, disconnectDB } from './config/db.js';
import { initializeSocket } from './socket/index.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { cleanupOrphanUploads } from './jobs/cleanup-uploads.js';

async function start() {
  await connectDB();

  const httpServer = createServer(app);
  initializeSocket(httpServer);

  httpServer.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Server running');
  });

  // ── Scheduled jobs ────────────────────────────────────────────────────────
  // Orphan upload cleanup: runs every day at 03:00 (server local time).
  // Deletes files in uploads/ that are no longer referenced by any DB record.
  cron.schedule('0 3 * * *', cleanupOrphanUploads);
  logger.info('[cron] Orphan upload cleanup scheduled (daily at 03:00)');

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
