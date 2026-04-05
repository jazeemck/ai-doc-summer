import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function finalSync3072() {
    try {
        console.log("🚀 Upgrading to 3072D Vector Grid...");

        // Clear and recreate with 3072 dimensions
        await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "Chunk" CASCADE;`);
        await prisma.$executeRawUnsafe(`
      CREATE TABLE "Chunk" (
        "id" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "embedding" vector(3072),
        "documentId" TEXT NOT NULL,
        CONSTRAINT "Chunk_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "Chunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
        console.log("✅ Vector grid upgraded to 3072D.");
    } catch (err) {
        console.error("❌ Upgrade Failed:", err);
    } finally {
        await prisma.$disconnect();
    }
}

finalSync3072();
