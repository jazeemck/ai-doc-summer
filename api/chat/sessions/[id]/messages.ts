import { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../../../_lib/db';
import { withCORS } from '../../../_lib/middleware';
import { aiService } from '../../../_lib/ai';

// ── CASUAL PATTERNS ────────────────────────────────────────────────
const CASUAL_PATTERNS = [
    /^(hi|hello|hey|yo|sup|howdy|hola|greetings|good\s*(morning|afternoon|evening|night))[\s!?.]*$/i,
    /^how\s+are\s+you[\s!?.]*$/i,
    /^what'?s?\s+up[\s!?.]*$/i,
    /^(thanks|thank\s+you|thx|ty)[\s!?.]*$/i,
    /^(bye|goodbye|see\s+you|cya|later)[\s!?.]*$/i,
    /^(ok|okay|sure|yep|yes|no|nope|cool|nice|great|awesome)[\s!?.]*$/i,
    /^(who\s+are\s+you|what\s+are\s+you|what\s+is\s+your\s+name)[\s!?.]*$/i,
];

const CASUAL_RESPONSES: Record<string, string[]> = {
    greeting: [
        "Hey there! 👋 How can I help you today?",
        "Hello! Ready to assist. What can I do for you?",
        "Hi! Got a question or want to dive into a document?",
    ],
    howAreYou: [
        "I'm doing great, thanks for asking! What can I help you with?",
        "Doing well! Ready to analyze anything you throw at me 🚀",
    ],
    thanks: [
        "You're welcome! Let me know if you need anything else.",
        "Happy to help! 😊",
    ],
    bye: [
        "See you later! Your documents are safe with me. 👋",
        "Goodbye! Come back anytime.",
    ],
    identity: [
        "I'm your Neural Assistant — I can analyze your documents, answer questions from PDFs, or just have a chat. What would you like to do?",
    ],
    default: [
        "Got it! Anything else I can help with?",
    ],
};

// ── SUMMARIZE DETECTION ────────────────────────────────────────────
const SUMMARIZE_PATTERNS = [
    /summarize|summary|summarise|overview|brief|digest|tldr|tl;dr/i,
    /what\s+is\s+this\s+(document|pdf|file|report)\s+(about|regarding)/i,
    /give\s+me\s+a\s+(summary|overview|brief)/i,
    /explain\s+this\s+(document|pdf|file|report)/i,
];

// ── DOC QUERY DETECTION ───────────────────────────────────────────
const DOC_QUERY_PATTERNS = [
    /explain\s+(section|chapter|part|page)/i,
    /what\s+(does|is|are)\s+(the|this)/i,
    /according\s+to\s+(the|this)\s+(document|pdf|file|report)/i,
    /from\s+(the|this)\s+(document|pdf|file|report)/i,
    /in\s+(the|this)\s+(document|pdf|file|report)/i,
    /find\s+in/i,
    /based\s+on\s+the\s+(document|pdf|file)/i,
    /content\s+of\s+this/i,
];

// ── INTENT CLASSIFIER ─────────────────────────────────────────────
type Intent = 'casual' | 'summarize' | 'doc_query' | 'general';

function classifyIntent(content: string, hasDocument: boolean): Intent {
    const trimmed = content.trim();

    // 1. Check casual patterns first
    for (const pattern of CASUAL_PATTERNS) {
        if (pattern.test(trimmed)) return 'casual';
    }

    // 2. Summarize request (only meaningful with a document)
    if (hasDocument) {
        for (const pattern of SUMMARIZE_PATTERNS) {
            if (pattern.test(trimmed)) return 'summarize';
        }
    }

    // 3. Document-specific query
    if (hasDocument) {
        for (const pattern of DOC_QUERY_PATTERNS) {
            if (pattern.test(trimmed)) return 'doc_query';
        }
    }

    // 4. If document is attached and message is longer than casual → treat as doc query
    if (hasDocument && trimmed.length > 15) return 'doc_query';

    // 5. Default: general knowledge
    return 'general';
}

function getCasualResponse(content: string): string {
    const lower = content.toLowerCase().trim();
    if (/^(hi|hello|hey|howdy|hola|greetings|good\s*(morning|afternoon|evening|night))/i.test(lower)) {
        return pick(CASUAL_RESPONSES.greeting);
    }
    if (/how\s+are\s+you/i.test(lower)) return pick(CASUAL_RESPONSES.howAreYou);
    if (/thanks|thank/i.test(lower)) return pick(CASUAL_RESPONSES.thanks);
    if (/bye|goodbye|see\s+you|cya/i.test(lower)) return pick(CASUAL_RESPONSES.bye);
    if (/who\s+are\s+you|what\s+are\s+you|your\s+name/i.test(lower)) return pick(CASUAL_RESPONSES.identity);
    return pick(CASUAL_RESPONSES.default);
}

function pick(arr: string[]): string {
    return arr[Math.floor(Math.random() * arr.length)];
}

// ── WIKIPEDIA FALLBACK ─────────────────────────────────────────────
async function fetchWikipediaSummary(query: string): Promise<string | null> {
    try {
        const searchUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
        const response = await fetch(searchUrl);
        if (!response.ok) return null;
        const data = await response.json();
        if (data.extract && data.extract.length > 50) {
            return `📚 *From Wikipedia:*\n\n${data.extract}`;
        }
        return null;
    } catch {
        return null;
    }
}

// ── MAIN HANDLER ───────────────────────────────────────────────────
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
                // 1. Permission check
                const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
                if (!session || session.userId !== req.user.id) return res.status(404).json({ error: 'Session not found.' });

                // Save USER message
                await prisma.message.create({ data: { role: 'user', content, sessionId } });

                // 2. INTENT DETECTION
                const hasDocument = !!documentId;
                const intent = classifyIntent(content, hasDocument);
                console.log(`[NeuralRAG] Intent: ${intent} | Document: ${hasDocument} | Query: "${content.substring(0, 60)}"`);

                // ── CASE 1: CASUAL ──────────────────────────────────
                if (intent === 'casual') {
                    const casualReply = getCasualResponse(content);
                    console.log(`[NeuralRAG] Response Source: CASUAL`);

                    res.setHeader('Content-Type', 'text/event-stream');
                    res.setHeader('Cache-Control', 'no-cache');
                    res.setHeader('Connection', 'keep-alive');

                    res.write(`data: ${JSON.stringify({ type: 'sources', sourceType: 'casual', sources: [] })}\n\n`);

                    // Stream casual response token-by-token for smooth UX
                    const words = casualReply.split(' ');
                    for (const word of words) {
                        res.write(`data: ${JSON.stringify({ type: 'token', text: word + ' ' })}\n\n`);
                    }

                    await prisma.message.create({
                        data: { role: 'assistant', content: casualReply, sessionId, sourceType: 'casual' }
                    });

                    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
                    res.end();
                    return;
                }

                // ── CASE 2: SUMMARIZE ───────────────────────────────
                if (intent === 'summarize' && documentId) {
                    console.log(`[NeuralRAG] Summarize Mode: Fetching all chunks for document ${documentId}`);

                    const doc = await prisma.document.findUnique({ where: { id: documentId } });
                    const docName = doc?.name || 'Current Document';

                    // Fetch ALL chunks (not similarity-based) for a true summary
                    const allChunks: any[] = await prisma.chunk.findMany({
                        where: { documentId, userId: req.user.id },
                        orderBy: { id: 'asc' },
                        take: 30, // Safety limit
                        select: { content: true }
                    });

                    if (allChunks.length === 0) {
                        // No chunks found, respond with error
                        res.setHeader('Content-Type', 'text/event-stream');
                        res.setHeader('Cache-Control', 'no-cache');
                        res.setHeader('Connection', 'keep-alive');
                        res.write(`data: ${JSON.stringify({ type: 'sources', sourceType: 'doc', sources: [{ documentName: docName }] })}\n\n`);
                        const errMsg = 'No content found in the document. The PDF may still be processing.';
                        res.write(`data: ${JSON.stringify({ type: 'token', text: errMsg })}\n\n`);
                        await prisma.message.create({ data: { role: 'assistant', content: errMsg, sessionId, sourceType: 'doc' } });
                        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
                        res.end();
                        return;
                    }

                    const fullDocText = allChunks.map(c => c.content).join('\n\n');
                    console.log(`[NeuralRAG] Summarizing ${allChunks.length} chunks from "${docName}"`);

                    const summaryPrompt = `Summarize the following document in a clear, structured, and human-friendly way. Use bullet points and headers where appropriate. Be thorough but concise.

Document Title: ${docName}

Document Content:
${fullDocText}`;

                    res.setHeader('Content-Type', 'text/event-stream');
                    res.setHeader('Cache-Control', 'no-cache');
                    res.setHeader('Connection', 'keep-alive');
                    res.write(`data: ${JSON.stringify({ type: 'sources', sourceType: 'doc', sources: [{ documentName: docName, chunkId: 'full-summary' }] })}\n\n`);

                    const stream = await aiService.generateContentStream({
                        systemInstruction: 'You are a document analysis expert. Provide clear, well-structured summaries.',
                        contents: [{ role: 'user', parts: [{ text: summaryPrompt }] }]
                    });

                    let fullResponse = '';
                    for await (const chunk of stream) {
                        if (chunk.text) {
                            fullResponse += chunk.text;
                            res.write(`data: ${JSON.stringify({ type: 'token', text: chunk.text })}\n\n`);
                        }
                    }

                    await prisma.message.create({
                        data: {
                            role: 'assistant', content: fullResponse, sessionId,
                            sourceType: 'doc',
                            sources: JSON.stringify([{ documentName: docName, chunkId: 'full-summary' }])
                        }
                    });

                    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
                    res.end();
                    return;
                }

                // ── CASE 3: DOCUMENT QUERY (RAG) ────────────────────
                if (intent === 'doc_query' && documentId) {
                    console.log(`[NeuralRAG] RAG Mode: Searching document ${documentId}`);

                    const doc = await prisma.document.findUnique({ where: { id: documentId } });
                    const docName = doc?.name || 'Current Document';

                    let contextText = '';
                    let sourceType: 'doc' | 'general' = 'general';
                    let sources: any[] = [];
                    const RELEVANCE_THRESHOLD = 0.65;

                    console.log(`[NeuralRAG] USER QUERY: "${content}"`);

                    try {
                        const embedding = await aiService.generateEmbedding(content);
                        if (embedding) {
                            console.log(`[NeuralRAG] Query embedding generated: ${embedding.length} dimensions`);
                            const vectorStr = `[${embedding.join(',')}]`;
                            const chunks: any[] = await prisma.$queryRawUnsafe(
                                `SELECT content, (embedding <=> CAST($1 AS vector)) as distance FROM "Chunk" WHERE "documentId" = $2 AND "userId" = $3 ORDER BY distance ASC LIMIT 5;`,
                                vectorStr, documentId, req.user.id
                            );

                            console.log(`[NeuralRAG] RETRIEVED CHUNKS: ${chunks.length}`);

                            if (chunks.length > 0) {
                                // Log each chunk for debugging
                                chunks.forEach((c, idx) => {
                                    console.log(`[NeuralRAG] Chunk ${idx + 1} | Distance: ${parseFloat(c.distance).toFixed(4)} | Preview: "${c.content.slice(0, 120)}..."`);
                                });

                                const bestDistance = parseFloat(chunks[0].distance);
                                console.log(`[NeuralRAG] Best Similarity: ${bestDistance.toFixed(4)} (Threshold: ${RELEVANCE_THRESHOLD})`);

                                if (bestDistance <= RELEVANCE_THRESHOLD) {
                                    sourceType = 'doc';
                                    sources = [{ documentName: docName, chunkId: 'rag-evidence' }];
                                    contextText = chunks.map(c => c.content).join('\n\n');
                                    console.log(`[NeuralRAG] ✅ Grounded in ${chunks.length} nodes | Source: PDF | Using PDF Data: YES`);
                                } else {
                                    console.log(`[NeuralRAG] ⚠️ Low relevance (${bestDistance.toFixed(4)}). Using PDF Data: NO → Falling back.`);
                                }
                            } else {
                                console.log(`[NeuralRAG] ⚠️ No chunks found in database for this document!`);
                            }
                        } else {
                            console.log(`[NeuralRAG] ⚠️ Embedding generation returned null for query.`);
                        }
                    } catch (ragErr: any) {
                        console.error('[NeuralRAG] RAG Phase Error:', ragErr.message);
                    }

                    const systemPrompt = sourceType === 'doc'
                        ? `You are a document analysis assistant. Answer ONLY using the provided context below.
If the answer is not in the context, say "I couldn't find this specific information in the document."
Be concise, natural, and helpful. Use "Based on the document..." when quoting information.

Context:
${contextText}

Question:
${content}`
                        : `You are a helpful assistant. The user asked about a document but no relevant content was found. Try to help with general knowledge. Be honest that this isn't from the document.`;

                    res.setHeader('Content-Type', 'text/event-stream');
                    res.setHeader('Cache-Control', 'no-cache');
                    res.setHeader('Connection', 'keep-alive');
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

                    await prisma.message.create({
                        data: {
                            role: 'assistant', content: fullResponse, sessionId,
                            sourceType,
                            sources: sources.length > 0 ? JSON.stringify(sources) : undefined
                        }
                    });

                    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
                    res.end();
                    return;
                }

                // ── CASE 4: GENERAL KNOWLEDGE (FALLBACK) ────────────
                console.log(`[NeuralRAG] General Mode: No document context.`);

                // Try Wikipedia first for factual queries
                let wikiContext = '';
                const factualPatterns = /^(who|what|when|where|why|how|define|explain)\s/i;
                if (factualPatterns.test(content.trim())) {
                    const searchTerm = content.replace(/^(who|what|when|where|why|how|define|explain)\s+(is|are|was|were|did|does|do)\s+/i, '').trim();
                    if (searchTerm.length > 2) {
                        const wiki = await fetchWikipediaSummary(searchTerm);
                        if (wiki) {
                            wikiContext = wiki;
                            console.log(`[NeuralRAG] 📚 Wikipedia context found for "${searchTerm}"`);
                        }
                    }
                }

                const generalPrompt = wikiContext
                    ? `You are a helpful assistant. Use the following Wikipedia context to enrich your answer, but also add your own knowledge. Be natural and conversational.

Wikipedia Context:
${wikiContext}

Question:
${content}`
                    : `You are a helpful, human-like assistant. Provide a concise and helpful answer. Avoid robotic phrases.`;

                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');

                const generalSourceType = wikiContext ? 'wiki' : 'general';
                res.write(`data: ${JSON.stringify({ type: 'sources', sourceType: generalSourceType, sources: [] })}\n\n`);

                const stream = await aiService.generateContentStream({
                    systemInstruction: generalPrompt,
                    contents: [{ role: 'user', parts: [{ text: content }] }]
                });

                let fullResponse = '';
                for await (const chunk of stream) {
                    if (chunk.text) {
                        fullResponse += chunk.text;
                        res.write(`data: ${JSON.stringify({ type: 'token', text: chunk.text })}\n\n`);
                    }
                }

                await prisma.message.create({
                    data: {
                        role: 'assistant', content: fullResponse, sessionId,
                        sourceType: generalSourceType,
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
