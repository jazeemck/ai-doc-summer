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

                // 2. Intelligence Preparation (Strict RAG Flow)
                let contextText = '';
                let sourceType: 'doc' | 'general' = 'general';
                let sources: any[] = [];
                const RELEVANCE_THRESHOLD = 0.55;

                if (documentId) {
                    try {
                        const doc = await prisma.document.findUnique({ where: { id: documentId } });
                        const docName = doc?.name || 'Current Document';

                        const embedding = await aiService.generateEmbedding(content);
                        if (embedding) {
                            const vectorStr = `[${embedding.join(',')}]`;
                            const limit = content.toLowerCase().includes('summary') ? 10 : 5;

                            const chunks: any[] = await prisma.$queryRawUnsafe(
                                `SELECT content, (embedding <=> CAST($1 AS vector)) as distance FROM "Chunk" WHERE "documentId" = $2 AND "userId" = $3 ORDER BY distance ASC LIMIT $4;`,
                                vectorStr, documentId, req.user.id, limit
                            );

                            if (chunks.length > 0) {
                                const bestDistance = chunks[0].distance;
                                console.log(`[NeuralRAG] Top Similarity for "${docName}": ${bestDistance.toFixed(4)}`);

                                if (bestDistance <= RELEVANCE_THRESHOLD) {
                                    sourceType = 'doc';
                                    sources = [{ documentName: docName, chunkId: 'neural-evidence' }];
                                    contextText = chunks.map(c => c.content).join('\n\n');
                                    console.log(`[NeuralRAG] Grounding confirmed in ${chunks.length} nodes.`);
                                } else {
                                    sourceType = 'general';
                                    console.log(`[NeuralRAG] Low relevance. Falling back to General AI.`);
                                }
                            }
                        }
                    } catch (contextErr: any) {
                        console.error('[NeuralMessage] RAG Phase FAIL:', contextErr.message);
                    }
                }

                // Unified Intelligence Prompting
                const systemPrompt = sourceType === 'doc'
                    ? `You are a high-fidelity assistant. Answer ONLY based on the provided context. 
If the answer is not in the context, say 'I cannot find a direct answer in the document, but here is what I know generally:' and provide a helpful response.
PRIORITIZE technical accuracy from the context.

Context:
${contextText}

Human Question:
${content}`
                    : `You are a helpful, human-like neural assistant. Use your general knowledge to provide a concise and helpful answer. Avoid robotic phrases.`;

                // 3. SSE Stream Execution
                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');

                // Metadata Handshake
                res.write(`data: ${JSON.stringify({ type: 'sources', sourceType, sources })}\n\n`);

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

                // Neural Record Finalization
                await prisma.message.create({
                    data: {
                        role: 'assistant',
                        content: fullResponse,
                        sessionId,
                        sourceType,
                        sources: sources.length > 0 ? JSON.stringify(sources) : undefined
                    }
                });
                res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
                res.end();
            } catch (err: any) {
                console.error('[NeuralMessage] CRITICAL:', err.message);
                if (!res.headersSent) res.status(500).json({ error: `Neural link failed: ${err.message}` });
                else res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
                res.end();
            }
        }
    });
}
