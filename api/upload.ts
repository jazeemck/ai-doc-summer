import { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from './_lib/db';
import { withCORS } from './_lib/middleware';
import { aiService } from './_lib/ai';
import { supabase } from './_lib/supabase';
import { randomUUID } from 'crypto';
import multer from 'multer';

export const config = {
    api: {
        bodyParser: false,
    },
};

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 4.5 * 1024 * 1024 }
}).any();

function runMiddleware(req: any, res: any, fn: any) {
    return new Promise((resolve, reject) => {
        fn(req, res, (result: any) => {
            if (result instanceof Error) return reject(result);
            return resolve(result);
        });
    });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    return withCORS(req, res, async (req: any, res: VercelResponse) => {
        let currentStep = "INITIALIZATION";

        try {
            // ── STEP 1: AUTH ────────────────────────────────────
            currentStep = "AUTH_VERIFICATION";
            if (!req.user) return res.status(401).json({ error: 'Auth Link Interrupted.', step: currentStep });

            // ── STEP 2: FILE INGESTION ──────────────────────────
            currentStep = "MULTIPART_INGESTION";
            await runMiddleware(req, res, upload);

            const files = req.files as any[];
            if (!files || files.length === 0) {
                return res.status(400).json({ error: 'No File Received.', step: currentStep });
            }

            const file = files[0];
            console.log(`[Upload] File received: ${file.originalname} | Size: ${file.size} bytes | Type: ${file.mimetype}`);

            // ── STEP 3: PDF TEXT EXTRACTION ─────────────────────
            currentStep = "TEXT_EXTRACTION";
            let rawText = '';

            try {
                const pdfParse = require('pdf-parse');
                const pdfData = await pdfParse(file.buffer);
                rawText = (pdfData.text || '').trim();
            } catch (parseErr: any) {
                console.error(`[Upload] PDF parse error:`, parseErr.message);
                return res.status(400).json({
                    error: `PDF extraction failed: ${parseErr.message}. The file may be corrupted or password-protected.`,
                    step: currentStep
                });
            }

            // ── VALIDATION: Check extracted text quality ────────
            console.log(`[Upload] EXTRACTED TEXT LENGTH: ${rawText.length}`);
            console.log(`[Upload] PDF SAMPLE (first 500 chars):\n${rawText.slice(0, 500)}`);

            if (rawText.length < 50) {
                return res.status(400).json({
                    error: 'This PDF has no readable text. It may be a scanned document (image-only) which is not supported. Please upload a PDF with selectable text.',
                    step: currentStep
                });
            }

            // ── STEP 4: CHUNKING ────────────────────────────────
            currentStep = "SEMANTIC_CHUNKING";
            const chunks: string[] = [];
            const chunkSize = 400; // words per chunk
            const overlap = 50;    // overlap for context continuity
            const words = rawText.split(/\s+/).filter(w => w.length > 0);

            console.log(`[Upload] Total words extracted: ${words.length}`);

            for (let i = 0; i < words.length; i += (chunkSize - overlap)) {
                const chunk = words.slice(i, i + chunkSize).join(' ').trim();
                if (chunk.length > 50) { // Reject tiny/empty chunks
                    chunks.push(chunk);
                }
                if (i + chunkSize >= words.length) break;
            }

            console.log(`[Upload] TOTAL CHUNKS: ${chunks.length}`);

            if (chunks.length === 0) {
                return res.status(400).json({
                    error: 'PDF text was extracted but no meaningful chunks could be created. The document may contain only headers or very short text.',
                    step: currentStep
                });
            }

            // Log quality of first few chunks
            chunks.slice(0, 3).forEach((c, i) => {
                console.log(`[Upload] Chunk ${i + 1} (${c.length} chars): ${c.slice(0, 120)}...`);
            });

            // ── STEP 5: SUPABASE STORAGE ────────────────────────
            currentStep = "SUPABASE_UPLOAD";
            const fileName = file.originalname || `neural_${Date.now()}.pdf`;
            const filePath = `${req.user.id}/${randomUUID()}_${fileName}`;

            const { error: storageErr } = await supabase.storage
                .from('documents')
                .upload(filePath, file.buffer, { contentType: file.mimetype });

            if (storageErr) throw new Error(`Supabase Storage Fail: ${storageErr.message}`);

            const { data: { publicUrl } } = supabase.storage
                .from('documents')
                .getPublicUrl(filePath);

            // ── STEP 6: DATABASE RECORD ─────────────────────────
            currentStep = "DATABASE_RECORD";
            const document = await prisma.document.create({
                data: {
                    name: fileName,
                    url: publicUrl,
                    size: file.size,
                    userId: req.user.id,
                    status: 'PROCESSING'
                }
            });

            console.log(`[Upload] Document record created: ${document.id}`);

            // ── STEP 7: EMBEDDINGS ──────────────────────────────
            currentStep = "BATCH_EMBEDDING";
            console.log(`[Upload] Generating embeddings for ${chunks.length} chunks...`);

            let embeddings: number[][] = [];
            try {
                embeddings = await aiService.generateEmbeddingsBatch(chunks);
                console.log(`[Upload] Embeddings generated: ${embeddings.length} vectors`);

                if (embeddings.length > 0) {
                    console.log(`[Upload] Embedding dimension: ${embeddings[0].length}`);
                }
            } catch (embErr: any) {
                console.error(`[Upload] Embedding generation failed:`, embErr.message);
                console.warn(`[Upload] Proceeding with zero-vector fallback for text-only indexing.`);
            }

            // ── STEP 8: VECTOR DB INSERTION ─────────────────────
            currentStep = "VECTOR_TRANSACTION";
            console.log(`[Upload] Inserting ${chunks.length} chunks into vector database...`);

            const subBatches: string[][] = [];
            const batchSize = 20;
            for (let i = 0; i < chunks.length; i += batchSize) {
                subBatches.push(chunks.slice(i, i + batchSize));
            }

            for (const [batchIdx, subBatch] of subBatches.entries()) {
                console.log(`[Upload] SQL Batch ${batchIdx + 1}/${subBatches.length} (${subBatch.length} chunks)`);

                const insertPromises = subBatch.map((chunk, i) => {
                    const globalIdx = (batchIdx * batchSize) + i;
                    const id = randomUUID();
                    const embedding = embeddings[globalIdx] || new Array(768).fill(0);
                    const vectorStr = `[${embedding.join(',')}]`;

                    // Validate before insert
                    if (!chunk || chunk.trim().length === 0) {
                        console.warn(`[Upload] Skipping empty chunk at index ${globalIdx}`);
                        return prisma.$executeRawUnsafe('SELECT 1');
                    }

                    return prisma.$executeRawUnsafe(
                        `INSERT INTO "Chunk" (id, content, "documentId", embedding, "userId") VALUES ($1, $2, $3, CAST($4 AS vector), $5)`,
                        id, chunk, document.id, vectorStr, req.user.id
                    );
                });

                await prisma.$transaction(insertPromises);
            }

            // ── STEP 9: FINALIZE ────────────────────────────────
            await prisma.document.update({
                where: { id: document.id },
                data: { status: 'COMPLETED' }
            });

            console.log(`[Upload] ✅ SUCCESS: ${chunks.length} chunks stored for document ${document.id}`);
            console.log(`[Upload] ✅ Embeddings: ${embeddings.length > 0 ? 'YES' : 'ZERO-VECTOR FALLBACK'}`);

            res.status(200).json({
                status: "completed",
                documentId: document.id,
                debug: {
                    textLength: rawText.length,
                    totalChunks: chunks.length,
                    embeddingsGenerated: embeddings.length,
                    embeddingDimension: embeddings[0]?.length || 0
                }
            });

        } catch (err: any) {
            console.error(`[Upload] ❌ CRITICAL FAIL at ${currentStep}:`, err.message);
            res.status(500).json({ error: err.message, step: currentStep });
        }
    });
}
