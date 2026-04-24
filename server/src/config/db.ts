import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

export async function connectDB() {
  try {
    await prisma.$connect();
    logger.info('PostgreSQL connected');
  } catch (error) {
    logger.error({ err: error }, 'PostgreSQL connection error');
    process.exit(1);
  }
}

export async function disconnectDB() {
  await prisma.$disconnect();
}
