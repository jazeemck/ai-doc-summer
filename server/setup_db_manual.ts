import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function enableVector() {
    try {
        console.log("Enabling pgvector extension...");
        await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector;`);
        console.log("pgvector enabled successfully!");

        console.log("Syncing DB with push...");
        // We already tried npx prisma db push, let's just ensure the table is there
        await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Document" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "size" INTEGER NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'PROCESSING',
        "userId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
      );
    `);

        await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Chunk" (
        "id" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "embedding" vector,
        "documentId" TEXT NOT NULL,
        CONSTRAINT "Chunk_pkey" PRIMARY KEY ("id")
      );
    `);

        console.log("Tables ensured.");

    } catch (err) {
        console.error("Manual DB setup failed:", err);
    } finally {
        await prisma.$disconnect();
    }
}

enableVector();
