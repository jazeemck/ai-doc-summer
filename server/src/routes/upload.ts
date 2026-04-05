import express from 'express';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';
import { aiService } from '../services/aiService';
import { randomUUID } from 'crypto';
import mammoth from 'mammoth';

const router = express.Router();
const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage() });

// Helper function to chunk text roughly by sentences.
function chunkText(text: string, maxChunkLength: number = 2000): string[] {
  if (!text) return [];
  const chunks: string[] = [];
  let currentChunk = '';
  // Split by sentence terminators
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > maxChunkLength) {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += ' ' + sentence;
    }
  }
  if (currentChunk) chunks.push(currentChunk.trim());
  return chunks;
}

router.get('/debug', (req, res) => {
  res.json({ message: 'Upload route is alive' });
});

router.post('/', authenticate, upload.array('files'), async (req: AuthRequest, res) => {
  const reqAny = req as any;
  if (!reqAny.files || reqAny.files.length === 0) {
    res.status(400).json({ error: 'No files uploaded' });
    return;
  }

  const files = reqAny.files as any[];
  const uploadedDocs: any[] = [];

  for (const file of files) {
    try {
      console.log(`[Upload] Init: ${file.originalname}`);

      // 1. Create Document record in PROCESSING state
      const document = await prisma.document.create({
        data: {
          name: file.originalname,
          size: file.size,
          status: 'PROCESSING',
          userId: req.user!.id,
        }
      });

      // --- Synchronous Sync Logic for Vercel Reliability ---
      try {
        console.log(`[NeuralSync] Processing ${file.originalname}...`);

        // 2. Extract Text
        let rawText = '';
        const extension = file.originalname.toLowerCase().split('.').pop();
        const mime = file.mimetype.toLowerCase();

        if (mime === 'application/pdf' || extension === 'pdf') {
          const pdfParse = require('pdf-parse');
          const data = await pdfParse(file.buffer);
          rawText = data.text || '';
        } else if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || extension === 'docx') {
          const result = await mammoth.extractRawText({ buffer: file.buffer });
          rawText = result.value || '';
        } else {
          rawText = file.buffer.toString('utf-8');
        }

        if (!rawText.trim()) throw new Error('Empty document');

        // 3. Chunking & Batch Embedding
        const chunks = chunkText(rawText);
        console.log(`[NeuralSync] ${chunks.length} chunks. Batching...`);

        const embeddings = await aiService.generateEmbeddingsBatch(chunks);
        console.log(`[NeuralSync] Successfully embedded ${embeddings.length} chunks. Syncing to DB...`);

        // 4. Bulk Insertion
        for (let i = 0; i < chunks.length; i++) {
          const content = chunks[i];
          const embedding = embeddings[i];
          if (embedding) {
            const vectorStr = `[${embedding.join(',')}]`;
            await prisma.$executeRaw`
              INSERT INTO "Chunk" (id, content, "documentId", embedding)
              VALUES (${randomUUID()}, ${content}, ${document.id}, ${vectorStr}::vector)
            `;
          }
        }

        // 5. Success State
        const updatedDoc = await prisma.document.update({
          where: { id: document.id },
          data: { status: 'COMPLETED' }
        });
        uploadedDocs.push(updatedDoc);
        console.log(`[NeuralSync] Synchronized: ${file.originalname}`);

      } catch (innerErr: any) {
        console.error(`[NeuralSync] Critical Failure:`, innerErr.message);
        const failedDoc = await prisma.document.update({
          where: { id: document.id },
          data: { status: 'FAILED' }
        });
        uploadedDocs.push(failedDoc);
      }

    } catch (err: any) {
      console.error(`[Upload] DB Error creating record:`, err.message);
    }
  }

  // Response with final statuses
  res.json({ message: 'Ingestion complete', documents: uploadedDocs });
});

export default router;
