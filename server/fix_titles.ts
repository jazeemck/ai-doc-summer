import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const sessions = await prisma.chatSession.findMany({
    where: {
      OR: [
        { title: 'New Conversation' },
        { title: 'New Chat' },
        { title: 'General Chat' }
      ]
    },
    include: {
      messages: {
        where: { role: 'user' },
        orderBy: { createdAt: 'asc' },
        take: 1
      }
    }
  });

  console.log(`Fixing ${sessions.length} sessions...`);

  for (const session of sessions) {
    if (session.messages.length > 0) {
      const content = session.messages[0].content;
      const newTitle = content.length > 30 ? content.substring(0, 30).trim() + '...' : content.trim();
      await prisma.chatSession.update({
        where: { id: session.id },
        data: { title: newTitle }
      });
      console.log(`Updated "${session.title}" -> "${newTitle}"`);
    } else {
      console.log(`Skipping "${session.title}" (no messages)`);
    }
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
