import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function finalSync() {
    try {
        console.log("🚀 Starting Final Neural Synchronization...");

        // 1. Ensure Extension
        await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector;`);
        console.log("✅ Vector extension confirmed.");

        // 2. Clear then recreate the Chunk table with EXACT naming for Prisma
        // We use quotes because Prisma uses case-sensitive identifiers "documentId"
        await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "Chunk" CASCADE;`);
        await prisma.$executeRawUnsafe(`
      CREATE TABLE "Chunk" (
        "id" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "embedding" vector(768),
        "documentId" TEXT NOT NULL,
        CONSTRAINT "Chunk_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "Chunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
        console.log("✅ Chunk table synchronized with 768-dim vector grid.");

    } catch (err) {
        console.error("❌ Sync Failed:", err);
    } finally {
        await prisma.$disconnect();
    }
}

finalSync();
