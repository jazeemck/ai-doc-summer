import { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../_lib/db';
import { withCORS } from '../_lib/middleware';
import { auth } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    return withCORS(req, res, async (req: VercelRequest, res: VercelResponse) => {
        if (req.method !== 'POST') return res.status(405).end();
        const { email, password } = req.body;

        try {
            const user = await prisma.user.findUnique({ where: { email } });
            if (!user || user.authProvider === 'google' || !user.password) {
                return res.status(401).json({ error: 'Auth credentials invalid.' });
            }

            const valid = await auth.comparePassword(password, user.password);
            if (!valid) return res.status(401).json({ error: 'Identity mismatch.' });

            const token = auth.signToken(user);
            res.setHeader('Set-Cookie', `token=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`);
            res.status(200).json({ user, token });
        } catch (err: any) {
            console.error('[Login Error]', err);
            res.status(500).json({ error: `Sync failure during login: ${err.message}` });
        }
    });
}
