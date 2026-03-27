import express from 'express';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';
import { aiService } from '../services/aiService';
import { randomUUID } from 'crypto';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PDFParse } = require('pdf-parse');
import mammoth from 'mammoth';

const router = express.Router();
const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage() });

// AI initialization moved to aiService.ts

console.log(`[Upload] AI setup complete. API Key present: ${!!process.env.GEMINI_API_KEY}`);
if (process.env.GEMINI_API_KEY) {
  console.log(`[Upload] API Key starts with: ${process.env.GEMINI_API_KEY.substring(0, 7)}...`);
}

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

router.post('/', authenticate, upload.array('files'), async (req: AuthRequest, res) => {
  const reqAny = req as any;
  if (!reqAny.files || reqAny.files.length === 0) {
    res.status(400).json({ error: 'No files uploaded' });
    return;
  }

  const files = reqAny.files as any[];
  const uploadedDocs = [];

  for (const file of files) {
    let documentId: string | null = null;
    try {
      console.log(`[Upload] Processing file: ${file.originalname} (${file.mimetype}, ${file.size} bytes)`);

      // 1. Create Document record in PROCESSING state
      const document = await prisma.document.create({
        data: {
          name: file.originalname,
          size: file.size,
          status: 'PROCESSING',
          userId: req.user!.id,
        }
      });
      documentId = document.id;
      uploadedDocs.push(document);

      // 2. Extract Text
      let rawText = '';
      const extension = file.originalname.toLowerCase().split('.').pop();
      const mime = file.mimetype.toLowerCase();

      if (mime === 'application/pdf' || extension === 'pdf') {
        try {
          const parser = new PDFParse({ data: file.buffer });
          const pdfData = await parser.getText();
          rawText = pdfData.text || '';
          await parser.destroy();
          console.log(`[Upload] PDF extraction complete. Length: ${rawText.length}`);
        } catch (pdfErr: any) {
          console.error('[Upload] PDF Parse Error:', pdfErr);
          throw new Error(`PDF extraction failed: ${pdfErr.message || pdfErr}`);
        }
      } else if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || extension === 'docx') {
        try {
          const result = await mammoth.extractRawText({ buffer: file.buffer });
          rawText = result.value || '';
          console.log(`[Upload] DOCX extraction complete. Length: ${rawText.length}`);
        } catch (docxErr: any) {
          console.error('[Upload] DOCX Parse Error:', docxErr);
          throw new Error(`DOCX extraction failed: ${docxErr.message || docxErr}`);
        }
      } else if (mime.includes('text') || extension === 'md' || extension === 'txt' || extension === 'markdown') {
        rawText = file.buffer.toString('utf-8');
        console.log(`[Upload] Text/MD extraction complete. Length: ${rawText.length}`);
      } else {
        // Fallback: try reading as text
        console.warn(`[Upload] Unknown format ${mime}. Attempting text fallback.`);
        rawText = file.buffer.toString('utf-8');
      }

      if (!rawText.trim()) {
        throw new Error('Document seems to be empty or could not be read.');
      }

      // 3. Chunk Text
      const chunks = chunkText(rawText);
      console.log(`[Upload] Text split into ${chunks.length} chunks.`);

      // 4. Generate Embeddings and Save
      let successCount = 0;
      for (let i = 0; i < chunks.length; i++) {
        const chunkContent = chunks[i];
        if (!chunkContent.trim()) continue;

        try {
          // Get embedding via aiService
          const embedding = await aiService.generateEmbedding(chunkContent);
          if (!embedding) {
            console.warn(`[Upload] No embedding returned for chunk ${i+1}`);
            continue;
          }

          const vectorStr = `[${embedding.join(',')}]`;
          const chunkId = randomUUID();

          // Explicit SQL for pgvector with Prisma (requires cast)
          await prisma.$executeRawUnsafe(`
            INSERT INTO "Chunk" (id, content, "documentId", embedding)
            VALUES ($1, $2, $3, $4::vector)
          `, chunkId, chunkContent, document.id, vectorStr);
          
          successCount++;
        } catch (error: any) {
          console.error("Gemini API Error (Upload Embedding):", {
            status: error.status,
            message: error.message,
            details: error
          });
          throw error; // Re-throw to catch block to mark doc as FAILED
        }
      }

      console.log(`[Upload] Successfully processed ${successCount} chunks for ${file.originalname}`);

      // 5. Update Status
      await prisma.document.update({
        where: { id: document.id },
        data: { status: 'COMPLETED' }
      });

    } catch (err: any) {
      const errMsg = err?.message || String(err);
      console.error(`\n❌ Error processing file "${file.originalname}":`, err);
      
      // Update status to FAILED
      if (documentId) {
         await prisma.document.update({
           where: { id: documentId },
           data: { status: 'FAILED' }
         }).catch((e: any) => console.error('Failed to update FAILED status:', e));
      }
    }
  }

  // Fetch the current updated statuses from database before returning
  const finalDocs = await prisma.document.findMany({
    where: { id: { in: uploadedDocs.map(d => d.id) } }
  });

  res.json({ message: 'Files processed', documents: finalDocs });
});

export default router;
