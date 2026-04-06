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
    // 1. DYNAMIC ORIGIN GUARDIAN (Preview + Production Support)
    const allowedOrigins = [
        'https://ai-doc-summer.vercel.app',
        /https:\/\/ai-doc-summer-.*\.vercel\.app/
    ];

    const origin = req.headers.origin || '';
    const isAllowed = allowedOrigins.some(o =>
        typeof o === 'string' ? o === origin : o.test(origin)
    );

    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', isAllowed ? origin : '');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    // 2. Handle pre-flight (OPTIONS)
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // 3. Identity Pulse Injection
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
