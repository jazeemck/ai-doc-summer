import { VercelRequest, VercelResponse } from '@vercel/node';
import { withCORS } from '../_lib/middleware';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    return withCORS(req, res, async (req: VercelRequest, res: VercelResponse) => {
        res.setHeader('Set-Cookie', 'token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
        res.status(200).json({ success: true, message: 'Neural link terminated.' });
    });
}
