import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const sessions = await prisma.chatSession.findMany({
    include: { _count: { select: { messages: true } } },
    take: 10,
    orderBy: { createdAt: 'desc' }
  });
  console.log('--- Sessions ---');
  sessions.forEach(s => {
    console.log(`ID: ${s.id}, Title: "${s.title}", Messages: ${s._count.messages}`);
  });
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
