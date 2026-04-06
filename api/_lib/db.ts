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

// ── Document Upload Types & Helpers ──────────────────────────────────────

export type GeminiDocumentResult = {
    summary: string;
    keyPoints: string[];
    documentType: string;
    topics: string[];
};

export type SaveDocumentInput = {
    fileName: string;
    mimeType: string;
    extractedText: string;
    metadata: GeminiDocumentResult;
    storagePath: string;
    publicUrl: string;
    size: number;
    userId: string;
    status: string;
};

export async function saveDocumentToDB(input: SaveDocumentInput) {
    const record = await prisma.document.create({
        data: {
            name: input.fileName,
            url: input.publicUrl,
            size: input.size,
            mimeType: input.mimeType,
            extractedText: input.extractedText,
            metadata: input.metadata as any,
            storagePath: input.storagePath,
            status: input.status,
            userId: input.userId,
        },
    });

    return {
        id: record.id,
        fileName: record.name,
        extractedText: record.extractedText ?? '',
        metadata: record.metadata as GeminiDocumentResult,
        storagePath: record.storagePath ?? '',
        createdAt: record.createdAt.toISOString(),
    };
}
