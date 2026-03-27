import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  try {
    const result: any[] = await prisma.$queryRawUnsafe(`
      SELECT atttypmod 
      FROM pg_attribute 
      WHERE attrelid = '"Chunk"'::regclass 
      AND attname = 'embedding'
    `);
    
    if (result.length > 0) {
      const atttypmod = result[0].atttypmod;
      console.log('atttypmod:', atttypmod);
      if (atttypmod === -1) {
        console.log('Dimension: No limit');
      } else {
        console.log('Dimension:', atttypmod);
      }
    } else {
      console.log('Column not found');
    }
  } catch (err: any) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
