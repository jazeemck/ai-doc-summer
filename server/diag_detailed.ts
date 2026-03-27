import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const allDocs = await prisma.document.findMany({
    orderBy: { createdAt: 'desc' },
  });

  console.log(`Total Documents: ${allDocs.length}`);
  
  for (const doc of allDocs) {
    const counts: any[] = await prisma.$queryRaw`SELECT count(*) FROM "Chunk" WHERE "documentId" = ${doc.id}`;
    const chunkCount = Number(counts[0].count);
    console.log(`Document: ${doc.name} (id: ${doc.id}) - Status: ${doc.status} - Chunks: ${chunkCount}`);
  }

  const globalChunks: any[] = await prisma.$queryRaw`SELECT count(*) FROM "Chunk"`;
  console.log(`Total Global Chunks: ${globalChunks[0].count}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
