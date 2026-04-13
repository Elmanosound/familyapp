import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

export async function connectDB() {
  try {
    await prisma.$connect();
    console.log('PostgreSQL connected successfully via Prisma');
  } catch (error) {
    console.error('PostgreSQL connection error:', error);
    process.exit(1);
  }
}

export async function disconnectDB() {
  await prisma.$disconnect();
}
