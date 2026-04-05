import { PrismaClient } from '@prisma/client';

/**
 * Shared Database Singleton for Serverless Performance
 */
const globalPrisma = global as unknown as { prisma: PrismaClient | undefined };

export const prisma = globalPrisma.prisma || new PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
});

if (process.env.NODE_ENV !== 'production') globalPrisma.prisma = prisma;
