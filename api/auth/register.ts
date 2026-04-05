import { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../_lib/db';
import { withCORS } from '../_lib/middleware';
import { auth } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    return withCORS(req, res, async (req: VercelRequest, res: VercelResponse) => {
        if (req.method !== 'POST') return res.status(405).end();
        const { email, password, name } = req.body;

        if (!email || !password || !name) return res.status(400).json({ error: 'Incomplete neural identity.' });

        try {
            const existing = await prisma.user.findUnique({ where: { email } });
            if (existing) return res.status(400).json({ error: 'Email already synchronized.' });

            const hashedPassword = await auth.hashPassword(password);
            const user = await prisma.user.create({
                data: { email, password: hashedPassword, name, authProvider: 'local' }
            });

            const token = auth.signToken(user);
            res.setHeader('Set-Cookie', `token=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`);
            res.status(201).json({ user, token });
        } catch (err) {
            res.status(500).json({ error: 'Sync failure during registration.' });
        }
    });
}
