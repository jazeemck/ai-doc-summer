import { PrismaClient } from '@prisma/client';

/**
 * Shared Database Singleton for Serverless Performance
 */
const globalPrisma = global as unknown as { prisma: PrismaClient | undefined };

const getDatabaseUrl = () => {
    let url = process.env.DATABASE_URL || '';
    if (url.includes('pooler.supabase.com')) {
        if (!url.includes('pgbouncer=true')) {
            url += (url.includes('?') ? '&' : '?') + 'pgbouncer=true';
        }
        if (!url.includes('statement_cache_size=0')) {
            url += (url.includes('?') ? '&' : '?') + 'statement_cache_size=0';
        }
    }
    return url;
};

export const prisma = globalPrisma.prisma || new PrismaClient({
    datasources: {
        db: { url: getDatabaseUrl() }
    },
    log: ['query', 'info', 'warn', 'error'],
});

if (process.env.NODE_ENV !== 'production') globalPrisma.prisma = prisma;
