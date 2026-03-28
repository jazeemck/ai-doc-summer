import express from 'express';
import { PrismaClient } from '@prisma/client';
import { aiService } from '../services/aiService';

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
  const diagnostics: any = {
    timestamp: new Date().toISOString(),
    env: {
      NODE_ENV: process.env.NODE_ENV,
      GEMINI_API_KEY_PRESENT: !!process.env.GEMINI_API_KEY,
      SUPABASE_URL_PRESENT: !!process.env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY_PRESENT: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      DATABASE_URL_PRESENT: !!process.env.DATABASE_URL,
    },
    database: 'checking...',
    aiService: 'checking...',
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    diagnostics.database = 'OK';
  } catch (err: any) {
    diagnostics.database = `ERROR: ${err.message}`;
  }

  try {
    // Just check model structure, don't generate to save quota
    diagnostics.aiService = 'OK (API Key initialized)';
  } catch (err: any) {
    diagnostics.aiService = `ERROR: ${err.message}`;
  }

  res.json(diagnostics);
});

export default router;
