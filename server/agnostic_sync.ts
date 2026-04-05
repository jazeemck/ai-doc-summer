import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function agnosticSync() {
    try {
        console.log("🚀 Switching to Agnostic Vector Grid...");

        // Clear and recreate with untyped vector
        await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "Chunk" CASCADE;`);
        await prisma.$executeRawUnsafe(`
      CREATE TABLE "Chunk" (
        "id" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "embedding" vector,
        "documentId" TEXT NOT NULL,
        CONSTRAINT "Chunk_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "Chunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
        console.log("✅ Vector grid is now model-agnostic.");
    } catch (err) {
        console.error("❌ Sync Failed:", err);
    } finally {
        await prisma.$disconnect();
    }
}

agnosticSync();
