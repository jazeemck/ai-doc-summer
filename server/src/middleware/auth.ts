import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const prisma = new PrismaClient();

export interface AuthRequest extends Request {
  user?: any;
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Unauthorized: No token provided' });
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('CRITICAL: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in server/.env');
    res.status(500).json({ error: 'Server Auth Misconfiguration: Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to server/.env' });
    return;
  }

  try {
    // Use Supabase Admin SDK to validate the token — this NEVER fails due to secret format issues.
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.error('Supabase token validation failed:', error?.message);
      res.status(401).json({ error: 'Unauthorized: Invalid or expired session. Please log out and log in again.' });
      return;
    }

    // Auto-sync Supabase user to Prisma DB
    try {
      const syncedUser = await prisma.user.upsert({
        where: { id: user.id },
        update: {},
        create: {
          id: user.id,
          email: user.email || '',
          name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User',
          authProvider: 'supabase',
        }
      });
      req.user = { ...user, dbUser: syncedUser };
    } catch (dbErr) {
      console.error('DB sync failed (non-fatal):', dbErr);
      req.user = { ...user };
    }

    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Internal server error during authentication' });
  }
};
