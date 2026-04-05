import { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from './_lib/db';
import { withCORS } from './_lib/middleware';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    return withCORS(req, res, async (req: any, res: VercelResponse) => {
        try {
            // Basic heartbeat
            await prisma.$executeRaw`SELECT 1`;
            res.status(200).json({ status: 'Neural Network Operational', time: new Date().toISOString() });
        } catch (err) {
            res.status(500).json({ status: 'Neural Network Down', error: String(err) });
        }
    });
}
