import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Shared Supabase Client
const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * PRODUCTION HARDENED: Shared CORS & Auth Security Layer
 */
export async function withCORS(req: VercelRequest, res: VercelResponse, handler: Function) {
    // Explicitly allowing your production domain to resolve "Failed to fetch" errors.
    const origin = req.headers.origin || '*';

    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', 'https://ai-doc-summer.vercel.app');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version');

    // 1. Handle pre-flight (OPTIONS) - MUST return 200 before the actual method runs.
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // 2. Identity Injection
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (!error && user) {
            (req as any).user = user;
        }
    }

    return handler(req, res);
}
