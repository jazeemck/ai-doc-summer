import { VercelRequest, VercelResponse } from '@vercel/node';
import { auth } from './auth';

/**
 * PRODUCTION HARDENED: Shared CORS & Local Auth Security Layer
 */
export async function withCORS(req: VercelRequest, res: VercelResponse, handler: Function) {
    // 1. DYNAMIC ORIGIN GUARDIAN
    const allowedOrigins = [
        'https://ai-doc-summer.vercel.app',
        /https:\/\/ai-doc-summer-.*\.vercel\.app/,
        'http://localhost:5173',
        'http://localhost:3000'
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

    // 3. NATIVE IDENTITY INJECTION
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const user = auth.verifyToken(token);
        if (user) {
            (req as any).user = user;
        }
    } else if (req.headers.cookie) {
        // Also support token from cookies (HttpOnly flow)
        const token = req.headers.cookie
            .split(';')
            .find(c => c.trim().startsWith('token='))
            ?.split('=')[1];

        if (token) {
            const user = auth.verifyToken(token);
            if (user) (req as any).user = user;
        }
    }

    return handler(req, res);
}
