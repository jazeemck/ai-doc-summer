import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function checkDb() {
    try {
        console.log("Checking DB connection...");
        await prisma.$queryRaw`SELECT 1`;
        console.log("DB connected!");

        console.log("Checking if pgvector is enabled...");
        const extensions = await prisma.$queryRawUnsafe(`SELECT * FROM pg_extension WHERE extname = 'vector'`);
        console.log("Vector extension search result:", extensions);

        console.log("Checking Chunk table schema...");
        const columns = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'Chunk'
    `);
        console.log("Chunk columns:", columns);

    } catch (err) {
        console.error("DB check failed:", err);
    } finally {
        await prisma.$disconnect();
    }
}

checkDb();
