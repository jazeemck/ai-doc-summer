// ── POLYFILLS: Required for pdf-parse / pdfjs-dist in Node.js serverless ──
// pdfjs-dist expects browser APIs that don't exist in Vercel/Node.js
if (typeof globalThis.DOMMatrix === 'undefined') {
    (globalThis as any).DOMMatrix = class DOMMatrix {
        m11 = 1; m12 = 0; m13 = 0; m14 = 0;
        m21 = 0; m22 = 1; m23 = 0; m24 = 0;
        m31 = 0; m32 = 0; m33 = 1; m34 = 0;
        m41 = 0; m42 = 0; m43 = 0; m44 = 1;
        a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
        is2D = true; isIdentity = true;
        inverse() { return new DOMMatrix(); }
        multiply() { return new DOMMatrix(); }
        translate() { return new DOMMatrix(); }
        scale() { return new DOMMatrix(); }
        rotate() { return new DOMMatrix(); }
        transformPoint() { return { x: 0, y: 0, z: 0, w: 1 }; }
    };
}
if (typeof globalThis.Path2D === 'undefined') {
    (globalThis as any).Path2D = class Path2D {
        constructor() { }
        addPath() { }
        closePath() { }
        moveTo() { }
        lineTo() { }
        bezierCurveTo() { }
        quadraticCurveTo() { }
        arc() { }
        arcTo() { }
        rect() { }
    };
}

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
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
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
            console.log(`[Upload] Multer processed. Files array length: ${files?.length || 0}`);
            if (files && files.length > 0) {
                files.forEach((f: any, i: number) => {
                    console.log(`[Upload] File[${i}]: field="${f.fieldname}", name="${f.originalname}", size=${f.size}, mime="${f.mimetype}", hasBuffer=${!!f.buffer}`);
                });
            }

            if (!files || files.length === 0) {
                console.error(`[Upload] FAIL: No files in request. Check frontend FormData field name.`);
                return res.status(400).json({ error: 'No File Received. Ensure the file is sent as multipart/form-data.', step: currentStep });
            }

            const file = files[0];
            if (!file.buffer || file.buffer.length === 0) {
                console.error(`[Upload] FAIL: File buffer is empty.`);
                return res.status(400).json({ error: 'File buffer is empty. The file may be corrupted.', step: currentStep });
            }

            console.log(`[Upload] ✅ File accepted: ${file.originalname} | ${file.size} bytes | Buffer: ${file.buffer.length} bytes`);

            // ── STEP 3: PDF TEXT EXTRACTION ─────────────────────
            currentStep = "TEXT_EXTRACTION";
            let rawText = '';

            try {
                console.log(`[Upload] Starting PDF text extraction...`);
                const pdfParse = require('pdf-parse');
                const pdfData = await pdfParse(file.buffer);
                rawText = (pdfData.text || '').trim();
                console.log(`[Upload] ✅ PDF parsed. Pages: ${pdfData.numpages}, Text length: ${rawText.length}`);
            } catch (parseErr: any) {
                console.error(`[Upload] ❌ PDF parse error:`, parseErr.message);
                // Provide user-friendly error
                const errorMsg = parseErr.message.includes('DOMMatrix') || parseErr.message.includes('Path2D')
                    ? 'Server environment error during PDF processing. Please try again.'
                    : `PDF extraction failed: ${parseErr.message}`;
                return res.status(400).json({
                    error: errorMsg,
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
