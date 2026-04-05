import { PrismaClient } from '@prisma/client';
import { aiService } from './src/services/aiService';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function diagnose() {
    console.log("🔍 Running Local Ingestion Diagnostic...");

    try {
        const testText = "Cortex One Neural Bridge Diagnostic Phase 1: Success.";
        console.log("1. Generating test embedding...");
        const embedding = await aiService.generateEmbedding(testText);
        console.log("✅ Embedding success! Size:", embedding.length);

        console.log("2. Cleaning old diagnostics...");
        await prisma.$executeRawUnsafe(`DELETE FROM "Document" WHERE name = 'DIAGNOSTIC_TEST'`);

        console.log("3. Creating test document...");
        const doc = await prisma.document.create({
            data: {
                id: 'diag-' + Date.now(),
                name: 'DIAGNOSTIC_TEST',
                size: 100,
                status: 'PROCESSING',
                userId: 'diag-user' // Mock ID
            }
        });

        console.log("4. Inserting test chunk with vector cast...");
        const vectorStr = `[${embedding.join(',')}]`;
        await prisma.$executeRaw`
      INSERT INTO "Chunk" (id, content, "documentId", embedding)
      VALUES (${'chunk-' + Date.now()}, ${testText}, ${doc.id}, ${vectorStr}::vector)
    `;
        console.log("✅ Vector insertion success!");

        console.log("5. Updating status...");
        await prisma.document.update({
            where: { id: doc.id },
            data: { status: 'COMPLETED' }
        });
        console.log("🚀 ALL SYSTEMS OPERATIONAL.");

    } catch (err) {
        console.error("❌ Diagnostic Failed:", err);
    } finally {
        await prisma.$disconnect();
    }
}

diagnose();
