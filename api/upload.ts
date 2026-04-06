export const config = {
    api: {
        bodyParser: false,
        sizeLimit: "10mb",
    },
};

// ── POLYFILLS: Required for pdf-parse / pdfjs-dist in Node.js serverless ──
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
import { prisma, saveDocumentToDB } from './_lib/db';
import { withCORS } from './_lib/middleware';
import { aiService } from './_lib/ai';
import { supabase } from './_lib/supabase';
import { callGeminiCascade } from './_lib/gemini';
import { uploadToStorage, getPublicUrl } from './_lib/storage';
import { extractPdfText } from './_lib/pdfExtract';
import { randomUUID } from 'crypto';
import multer from 'multer';

// ── Multer: in-memory, 10 MB cap ─────────────────────────────────────────
const uploadMiddleware = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
}).any();

function runMiddleware(req: any, res: any, fn: any) {
    return new Promise((resolve, reject) => {
        fn(req, res, (result: any) => {
            if (result instanceof Error) return reject(result);
            return resolve(result);
        });
    });
}

// ── MIME → extraction strategy ───────────────────────────────────────────
async function extractTextFromFile(
    buffer: Buffer,
    mimeType: string,
    fileName: string
): Promise<string> {
    if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) {
        console.log('[Upload] Extracting text from PDF via helper...');
        return await extractPdfText(buffer);
    }

    if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        fileName.endsWith('.docx')
    ) {
        console.log('[Upload] Extracting text from DOCX...');
        const mammoth = require('mammoth');
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
    }

    // .txt, .md, and everything else — treat as UTF-8
    console.log('[Upload] Reading as plain text...');
    return buffer.toString('utf-8');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    return withCORS(req, res, async (req: any, res: VercelResponse) => {
        let currentStep = "INITIALIZATION";

        try {
            // STEP 1 — Auth check
            if (!req.user) {
                return res.status(401).json({ error: 'Unauthorized: Neural link not established.' });
            }

            // STEP 2 — Parse multipart body
            currentStep = "MULTIPART_INGESTION";
            await runMiddleware(req, res, uploadMiddleware);

            const files = req.files as any[];
            const body = req.body || {};
            const action = body.action || (files?.length > 0 ? 'ingest-rag' : 'extract-document');
            const content = body.content;

            console.log(`[Upload] Processing: action=${action}, files=${files?.length || 0}`);

            // ── PATH A: EXTRACT DOCUMENT (Gemini analysis + direct save) ───────
            if (action === 'extract-document') {
                currentStep = 'DOCUMENT_EXTRACTION';

                const file = files?.[0];
                if (!file && !content?.trim()) {
                    return res.status(400).json({ error: 'Provide a file or text content.' });
                }

                let rawText = '';
                let fileName = 'pasted-text.txt';
                let mimeType = 'text/plain';
                let storagePath = '';
                let publicUrl = '';
                let fileSize = 0;

                if (file) {
                    fileName = file.originalname;
                    mimeType = file.mimetype;
                    fileSize = file.size;
                    rawText = await extractTextFromFile(file.buffer, mimeType, fileName);

                    if (rawText.trim().length < 30) {
                        return res.status(400).json({ error: 'No readable text found in document.' });
                    }

                    storagePath = await uploadToStorage(file.buffer, fileName, mimeType, req.user.id);
                    publicUrl = getPublicUrl(storagePath);
                } else {
                    rawText = content!.trim();
                    fileSize = Buffer.byteLength(rawText, 'utf-8');
                }

                console.log(`[Upload] Starting Gemini analysis...`);
                const geminiResult = await callGeminiCascade(rawText, fileName);

                const record = await saveDocumentToDB({
                    fileName,
                    mimeType,
                    extractedText: rawText,
                    metadata: geminiResult,
                    storagePath,
                    publicUrl,
                    size: fileSize,
                    userId: req.user.id,
                    status: 'COMPLETED',
                });

                return res.status(200).json({ ...record, status: 'completed' });
            }

            // ── PATH B: INGEST RAG (Original vector processing logic) ──────────
            if (action === 'ingest-rag') {
                currentStep = "RAG_PROCESSING";
                const file = files?.[0];
                if (!file) return res.status(400).json({ error: 'No file received for ingestion.' });

                console.log(`[Upload] RAG Ingestion for: ${file.originalname}`);
                const rawText = await extractTextFromFile(file.buffer, file.mimetype, file.originalname);

                if (rawText.length < 50) {
                    return res.status(400).json({ error: 'Document too small or no readable text.' });
                }

                // Chunking logic
                const chunks: string[] = [];
                const words = rawText.split(/\s+/).filter(w => w.length > 0);
                for (let i = 0; i < words.length; i += 350) { // Using 350-50 overlap
                    chunks.push(words.slice(i, i + 400).join(' ').trim());
                    if (i + 400 >= words.length) break;
                }

                // Supabase upload (legacy path uses custom filename logic)
                const filePath = `${req.user.id}/${randomUUID()}_${file.originalname}`;
                await supabase.storage.from('documents').upload(filePath, file.buffer, { contentType: file.mimetype });
                const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(filePath);

                // DB Record
                const document = await prisma.document.create({
                    data: {
                        name: file.originalname,
                        url: publicUrl,
                        size: file.size,
                        userId: req.user.id,
                        status: 'PROCESSING'
                    }
                });

                // Embeddings
                const embeddings = await aiService.generateEmbeddingsBatch(chunks);

                // Vector Insertion
                for (let i = 0; i < chunks.length; i++) {
                    const vector = embeddings[i] || new Array(768).fill(0);
                    const vectorStr = `[${vector.join(',')}]`;
                    await prisma.$executeRawUnsafe(
                        `INSERT INTO "Chunk" (id, content, "documentId", embedding, "userId") VALUES ($1, $2, $3, CAST($4 AS vector), $5)`,
                        randomUUID(), chunks[i], document.id, vectorStr, req.user.id
                    );
                }

                await prisma.document.update({
                    where: { id: document.id },
                    data: { status: 'COMPLETED' }
                });

                return res.status(200).json({ status: "completed", documentId: document.id, totalChunks: chunks.length });
            }

            return res.status(400).json({ error: 'Invalid action.' });

        } catch (err: any) {
            console.error(`[Upload] ❌ Error at ${currentStep}:`, err.message);
            return res.status(500).json({ error: err.message, step: currentStep });
        }
    });
}
