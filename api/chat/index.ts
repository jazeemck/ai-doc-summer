import { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../_lib/db';
import { withCORS } from '../_lib/middleware';
import { aiService } from '../_lib/ai';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    return withCORS(req, res, async (req: any, res: VercelResponse) => {
        if (!req.user) return res.status(401).json({ error: 'Auth link failed.' });
        if (req.method !== 'POST') return res.status(405).end();

        const { content, documentId } = req.body;

        try {
            // 1. Context Retrieval
            let context = '';
            if (documentId) {
                const chunks: any[] = await prisma.$queryRaw`
          SELECT content FROM "Chunk" WHERE "documentId" = ${documentId} LIMIT 2
        `;
                context = chunks.map(c => c.content).join('\n\n');
            }

            // 2. Generation (Non-streaming for simplicity in this endpoint)
            const stream = await aiService.generateContentStream({
                systemInstruction: context ? `Use context: ${context}` : undefined,
                contents: [{ role: 'user', parts: [{ text: content }] }]
            });

            let fullText = '';
            for await (const chunk of stream) {
                fullText += chunk.text || '';
            }

            res.status(200).json({ response: fullText });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });
}
