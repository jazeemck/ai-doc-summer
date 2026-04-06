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
            // 1. Context Retrieval (Neural Similarity Search)
            let context = '';
            if (documentId && content) {
                const queryVector = await aiService.generateEmbedding(content);
                const vectorStr = `[${queryVector.join(',')}]`;

                const chunks: any[] = await prisma.$queryRawUnsafe(`
                    SELECT content, 1 - (embedding <=> '${vectorStr}'::vector) as similarity
                    FROM "Chunk" 
                    WHERE "documentId" = '${documentId}'
                    ORDER BY similarity DESC
                    LIMIT 4
                `);

                context = chunks.map(c => c.content).join('\n\n');
                console.log(`[NeuralChat] Context extracted from ${chunks.length} nodes. Max Similarity: ${chunks[0]?.similarity}`);
            }

            // 2. Generation 
            const stream = await aiService.generateContentStream({
                systemInstruction: context
                    ? `You are Cortex (v2), a high-fidelity neuro-logical assistant. 
                       Use the provided memory fragments to answer. If irrelevant, rely on base model intelligence.
                       CONTEXT MEMORY:
                       ${context}`
                    : "You are Cortex, a neural assistant. Help the user with their queries.",
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
