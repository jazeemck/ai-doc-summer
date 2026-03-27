import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';
import { aiService } from '../services/aiService';

const router = express.Router();
const prisma = new PrismaClient();

// Cooldown storage: Map<sessionId, lastRequestTime>
const cooldowns = new Map<string, number>();
const COOLDOWN_MS = 3000;

// Get all chat sessions for the logged in user
router.get('/sessions', authenticate, async (req: AuthRequest, res) => {
  try {
    const sessions = await prisma.chatSession.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' }
    });
    res.json(sessions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// Create a new chat session
router.post('/sessions', authenticate, async (req: AuthRequest, res) => {
  const { title } = req.body;
  try {
    const session = await prisma.chatSession.create({
      data: {
        title: title || 'New Chat',
        userId: req.user!.id
      }
    });
    res.json(session);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Get messages for a session
router.get('/sessions/:id/messages', authenticate, async (req: AuthRequest, res) => {
  const sessionId = req.params.id as string;
  try {
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId }
    });
    
    if (!session || session.userId !== req.user!.id) {
       res.status(404).json({ error: 'Session not found' });
       return;
    }

    const messages = await prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' }
    });
    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Direct chat endpoint as requested by user
router.post('/', authenticate, async (req: AuthRequest, res) => {
  const { content, documentId } = req.body;
  
  // Goal: POST /api/chat (input: message + documentId, output: AI response)
  // This endpoint provides a stateless/auto-session chat for demo purposes.
  try {
    // 1. Find or create 'General' session
    let session = await prisma.chatSession.findFirst({
      where: { userId: req.user!.id, title: 'General Chat' }
    });
    if (!session) {
      session = await prisma.chatSession.create({
        data: { title: 'General Chat', userId: req.user!.id }
      });
    }

    // 2. Delegate to the message logic
    let context = '';
    if (documentId) {
       const chunks: any[] = await prisma.$queryRaw`
         SELECT content FROM "Chunk" WHERE "documentId" = ${documentId} LIMIT 2
       `;
       context = chunks.map(c => c.content).join('\n\n');
    }

    const stream = await aiService.generateContentStream({
      systemInstruction: context ? `Use context: ${context}` : undefined,
      contents: [{ role: 'user', parts: [{ text: content }] }]
    });

    let fullText = '';
    for await (const chunk of stream) {
      fullText += chunk.text || '';
    }

    res.json({ response: fullText });
  } catch (error: any) {
    const err = aiService.handleError(error);
    res.status((err as any).status || 500).json({ error: err.message });
  }
});

// Post a message and get an AI response
router.post('/sessions/:id/messages', authenticate, async (req: AuthRequest, res) => {
  const sessionId = req.params.id as string;
  const { content, documentId, mode = 'smart' } = req.body;
  if (!content) {
    res.status(400).json({ error: 'Message content required' });
    return;
  }

  try {
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId }
    });
    
    if (!session || session.userId !== req.user!.id) {
       res.status(404).json({ error: 'Session not found' });
       return;
    }

    // 0. Rate Limit: 3-second cooldown
    const now = Date.now();
    const lastRequest = cooldowns.get(sessionId) || 0;
    if (now - lastRequest < COOLDOWN_MS) {
      res.status(429).json({ error: 'Too many requests, wait a few seconds' });
      return;
    }
    cooldowns.set(sessionId, now);

    // Save user message
    await prisma.message.create({
      data: {
        role: 'user',
        content,
        sessionId
      }
    });

    // Update session title if it's still generic
    const isGenericTitle = !session.title || 
                          session.title.trim() === 'New Conversation' || 
                          session.title.trim() === 'New Chat' ||
                          session.title.trim() === 'General Chat';

    if (isGenericTitle) {
      const newTitle = content.length > 30 ? content.substring(0, 30).trim() + '...' : content.trim();
      await prisma.chatSession.update({
        where: { id: sessionId },
        data: { title: newTitle }
      });
      console.log(`[Chat] Rebranded session ${sessionId} to: ${newTitle}`);
    }
    let embedding: number[] | undefined;
    try {
      embedding = await aiService.generateEmbedding(content);
    } catch (error: any) {
      console.warn(`[Chat] Embedding failed, fallback to general knowledge.`);
    }
    
    // Formatting the vector array to a string for pgvector mapping
    const vectorStr = embedding ? `[${embedding.join(',')}]` : null;

    // 2. Query nearest chunks using pgvector cosine distance
    let nearestChunks: any[] = [];
    const SIMILARITY_THRESHOLD = 0.45; // Cosine distance: smaller is better.

    if (vectorStr) {
      try {
        if (documentId) {
          nearestChunks = await prisma.$queryRaw`
            SELECT id, "documentId", content, (embedding <=> ${vectorStr}::vector) as distance
            FROM "Chunk"
            WHERE "documentId" = ${documentId}
            ORDER BY distance ASC
            LIMIT 3;
          `;
        } else {
          nearestChunks = await prisma.$queryRaw`
            SELECT c.id, c."documentId", c.content, (c.embedding <=> ${vectorStr}::vector) as distance
            FROM "Chunk" c
            INNER JOIN "Document" d ON c."documentId" = d.id
            WHERE d."userId" = ${req.user!.id}
            ORDER BY distance ASC
            LIMIT 3;
          `;
        }
      } catch (dbErr) {
        console.warn("Vector search failed:", dbErr);
      }
    }

    // Confidence Check
    const filteredChunks = nearestChunks.filter(c => c.distance < SIMILARITY_THRESHOLD);
    const useDocuments = filteredChunks.length > 0;
    const bestDistance = nearestChunks.length > 0 ? nearestChunks[0].distance : 1.0;

    console.log(`[Chat] Decision: bestDistance=${bestDistance.toFixed(4)}, mode=${mode}, useDocuments=${useDocuments}`);

    // Provide context string
    const contextText = filteredChunks.map((c: any) => c.content).join('\n\n');
    
    // Construct system prompt per user requirement
    const systemPrompt = `You are an AI assistant with access to user-provided documents.

Rules:
1. If the answer is found in the documents, answer ONLY using that information.
2. If the documents do NOT contain the answer, you may use general knowledge.
3. Always clearly indicate the source of your answer.

Format:
* If from documents: '📄 Based on your documents: [Your Answer]'
* If general knowledge: '🌐 Based on general knowledge: [Your Answer]'
* Do NOT mix both unless absolutely necessary.

${useDocuments ? `CONTEXT DOCUMENTS:\n${contextText}` : "No relevant document context found. Answer using general knowledge."}`;

    // Prepare previous history
    const history = await prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: 3
    });
    
    const sortedHistory = history.reverse();

    const contents = sortedHistory.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    // Setup Server-Sent Events (SSE) stream
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    // Gather sources mapping
    let sources: any[] = [];
    if (useDocuments) {
      const documentIds = [...new Set(filteredChunks.map((c: any) => c.documentId))];
      const documents = await prisma.document.findMany({
        where: { id: { in: documentIds } },
        select: { id: true, name: true }
      });
      const docMap = new Map(documents.map(d => [d.id, d.name]));
      
      sources = filteredChunks.map(c => ({
        documentName: docMap.get(c.documentId) || 'Unknown Document',
        chunkId: c.id
      }));

      // Send sources first via SSE
      res.write(`data: ${JSON.stringify({ type: 'sources', sources, sourceType: 'doc' })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ type: 'sources', sources: [], sourceType: 'general' })}\n\n`);
    }

    // Call Gemini Generative AI API via aiService
    console.log(`[Chat] Executing generation. Source: ${useDocuments ? 'Document' : 'General'}`);
    const stream = await aiService.generateContentStream({
      systemInstruction: systemPrompt,
      contents: contents as any[]
    });

    let fullResponse = '';

    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) {
        fullResponse += text;
        res.write(`data: ${JSON.stringify({ type: 'token', text })}\n\n`);
      }
    }

    // Save assistant message to DB
    await prisma.message.create({
      data: {
        role: 'assistant',
        content: fullResponse,
        sources,
        sessionId
      }
    });

    // Notify client stream is complete
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();

  } catch (error: any) {
    // console.error handled already by aiService
    
    let errorMessage = error.message || '⚠️ AI temporarily unavailable. Try again.';
    
    if (!res.headersSent) {
      res.status(error.status || 500).json({ error: errorMessage });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', message: errorMessage })}\n\n`);
      res.end();
    }
  }
});

export default router;
