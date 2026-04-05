import { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../_lib/db';
import { withCORS } from '../_lib/middleware';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    return withCORS(req, res, async (req: any, res: VercelResponse) => {
        if (!req.user) return res.status(401).json({ error: 'Identity unknown.' });

        try {
            const user = await prisma.user.findUnique({
                where: { id: req.user.id },
                select: { id: true, email: true, name: true, role: true }
            });
            if (!user) return res.status(404).json({ error: 'User link lost.' });
            res.status(200).json(user);
        } catch (err) {
            res.status(500).json({ error: 'Neural link server failure.' });
        }
    });
}
