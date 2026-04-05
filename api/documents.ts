import { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from './_lib/db';
import { withCORS } from './_lib/middleware';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    return withCORS(req, res, async (req: any, res: VercelResponse) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized: Neural link not established.' });
        }

        try {
            const documents = await prisma.document.findMany({
                where: { userId: req.user.id },
                orderBy: { createdAt: 'desc' }
            });
            res.status(200).json(documents);
        } catch (err: any) {
            console.error('[API Documents Error]', err);
            res.status(500).json({ error: 'Failed to retrieve neural memories.' });
        }
    });
}
