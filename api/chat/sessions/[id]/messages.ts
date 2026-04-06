import { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../../../_lib/db';
import { withCORS } from '../../../_lib/middleware';
import { aiService } from '../../../_lib/ai';
import { randomUUID } from 'crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    return withCORS(req, res, async (req: any, res: VercelResponse) => {
        if (!req.user) return res.status(401).json({ error: 'Neural link failed: Unauthorized.' });
        const { id: sessionId } = req.query as { id: string };

        if (req.method === 'GET') {
            try {
                const messages = await prisma.message.findMany({
                    where: { sessionId },
                    orderBy: { createdAt: 'asc' }
                });
                res.status(200).json(messages);
            } catch (err) {
                res.status(500).json({ error: 'Failed to retrieve messages.' });
            }
        } else if (req.method === 'POST') {
            const { content, documentId } = req.body;
            if (!content) return res.status(400).json({ error: 'Empty prompt.' });

            try {
                // 1. Logic Check (Permission)
                const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
                if (!session || session.userId !== req.user.id) return res.status(404).json({ error: 'Session not found.' });

                // Save USER message
                await prisma.message.create({ data: { role: 'user', content, sessionId } });

                // 2. Intelligence Preparation (Context & Embeddings)
                let contextText = '';
                if (documentId) {
                    const embedding = await aiService.generateEmbedding(content);
                    if (embedding) {
                        const vectorStr = `[${embedding.join(',')}]`;
                        const chunks: any[] = await prisma.$queryRawUnsafe(`
              SELECT content, (embedding <=> $1::vector) as distance FROM "Chunk" d WHERE "documentId" = $2 AND "userId" = $3 ORDER BY distance ASC LIMIT 3;
            `, vectorStr, documentId, req.user.id);
                        contextText = chunks.map(c => c.content).join('\n\n');
                    }
                }

                const systemPrompt = `You are a neural assistant. USE CONTEXT BELOW FOR ACCURACY:\n\n${contextText || "No document context available."}`;

                // 3. SSE Stream Execution
                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');

                const stream = await aiService.generateContentStream({
                    systemInstruction: systemPrompt,
                    contents: [{ role: 'user', parts: [{ text: content }] }]
                });

                let fullResponse = '';
                for await (const chunk of stream) {
                    if (chunk.text) {
                        fullResponse += chunk.text;
                        res.write(`data: ${JSON.stringify({ type: 'token', text: chunk.text })}\n\n`);
                    }
                }

                // Save ASSISTANT message
                await prisma.message.create({ data: { role: 'assistant', content: fullResponse, sessionId } });
                res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
                res.end();
            } catch (err: any) {
                if (!res.headersSent) res.status(500).json({ error: 'Neural stream failure.' });
                else res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
                res.end();
            }
        }
    });
}
