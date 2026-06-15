import { PrismaClient } from '@prisma/client';

// Single shared Prisma client across the app.
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
});
