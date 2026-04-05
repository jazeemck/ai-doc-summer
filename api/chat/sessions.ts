import { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../_lib/db';
import { withCORS } from '../_lib/middleware';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    return withCORS(req, res, async (req: any, res: VercelResponse) => {
        if (!req.user) return res.status(401).json({ error: 'Identity not verified.' });

        if (req.method === 'GET') {
            try {
                const sessions = await prisma.chatSession.findMany({
                    where: { userId: req.user.id },
                    orderBy: { createdAt: 'desc' }
                });
                res.status(200).json(sessions);
            } catch (err) {
                res.status(500).json({ error: 'Failed to retrieve sessions.' });
            }
        } else if (req.method === 'POST') {
            const { title } = req.body;
            try {
                const session = await prisma.chatSession.create({
                    data: {
                        title: title || 'New Neural Thread',
                        userId: req.user.id
                    }
                });
                res.status(201).json(session);
            } catch (err) {
                res.status(500).json({ error: 'Failed to initiate session.' });
            }
        }
    });
}
