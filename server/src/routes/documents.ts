import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const documents = await prisma.document.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' }
    });
    res.json(documents);
  } catch (err) {
    console.error('[Documents Route Error]', err);
    res.status(500).json({ 
      error: 'Failed to fetch documents',
      details: process.env.NODE_ENV === 'development' ? String(err) : undefined 
    });
  }
});

export default router;
