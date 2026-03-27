import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const documents = await prisma.document.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });

  console.log('--- Last 5 Documents ---');
  for (const doc of documents) {
    const chunkCount = await prisma.chunk.count({
      where: { documentId: doc.id }
    });
    console.log(`Document: ${doc.name} (id: ${doc.id}) - Status: ${doc.status} - Chunks: ${chunkCount}`);
    
    if (chunkCount > 0) {
      const firstChunk = await prisma.chunk.findFirst({
        where: { documentId: doc.id }
      });
      console.log(`Sample content from first chunk: ${firstChunk?.content?.substring(0, 50)}...`);
    }
  }

  // Check if vector extension is enabled
  try {
     const result: any[] = await prisma.$queryRaw`SELECT extname FROM pg_extension WHERE extname = 'vector'`;
     console.log('Extension check:', result);
  } catch (e) {
     console.error('Vector extension check failed');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
