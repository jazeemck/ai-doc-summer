import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const p = new PrismaClient();

async function checkDims() {
    try {
        const r = await p.$queryRawUnsafe(`SELECT vector_dims(embedding) as dims FROM "Chunk" LIMIT 1`);
        console.log('Current DB dimension:', r);
    } catch (err) {
        console.error('Check failed:', err);
    } finally {
        await p.$disconnect();
    }
}

checkDims();
