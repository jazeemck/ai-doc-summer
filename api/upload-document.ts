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
import { withCORS } from './_lib/middleware';
import { saveDocumentToDB } from './_lib/db';
import { callGeminiCascade } from './_lib/gemini';
import { uploadToStorage, getPublicUrl } from './_lib/storage';
import multer from 'multer';

export const config = {
    api: {
        bodyParser: false,
        sizeLimit: "10mb",
    },
};

// ── Multer: in-memory, 10 MB cap ─────────────────────────────────────────
const uploadMiddleware = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
}).any();

function runMulter(req: any, res: any): Promise<void> {
    return new Promise((resolve, reject) => {
        uploadMiddleware(req, res, (err: any) => {
            if (err) reject(err);
            else resolve();
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
        console.log('[UploadDoc] Extracting text from PDF...');
        const pdfParseModule = require('pdf-parse');
        const pdfParse = pdfParseModule.default || pdfParseModule;
        const parsed = await pdfParse(buffer);
        return parsed.text;
    }

    if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        fileName.endsWith('.docx')
    ) {
        console.log('[UploadDoc] Extracting text from DOCX...');
        const mammoth = require('mammoth');
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
    }

    // .txt, .md, and everything else — treat as UTF-8
    console.log('[UploadDoc] Reading as plain text...');
    return buffer.toString('utf-8');
}

// ── Main handler ─────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
    return withCORS(req, res, async (req: any, res: VercelResponse) => {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        // Step 1 — Auth check
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized: Neural link not established.' });
        }

        let currentStep = 'INITIALIZATION';

        try {
            // Step 2 — Parse multipart body
            currentStep = 'MULTIPART_PARSE';
            await runMulter(req, res);

            const files = req.files as any[];
            const body = req.body || {};
            const action = body.action;
            const content = body.content;

            console.log(`[UploadDoc] Action: ${action}, Files: ${files?.length || 0}, Content: ${content ? 'yes' : 'no'}`);

            if (action !== 'extract-document') {
                return res.status(400).json({ error: 'Invalid action. Expected "extract-document".', step: currentStep });
            }

            const file = files?.[0];
            if (!file && !content?.trim()) {
                return res.status(400).json({ error: 'Provide a file or text content.', step: currentStep });
            }

            let rawText = '';
            let fileName = 'pasted-text.txt';
            let mimeType = 'text/plain';
            let storagePath = '';
            let publicUrl = '';
            let fileSize = 0;

            if (file) {
                // Step 3a — Extract text server-side (pdf-parse / mammoth / utf8)
                currentStep = 'TEXT_EXTRACTION';
                fileName = file.originalname;
                mimeType = file.mimetype;
                fileSize = file.size;

                console.log(`[UploadDoc] File: ${fileName} | ${fileSize} bytes | ${mimeType}`);
                rawText = await extractTextFromFile(file.buffer, mimeType, fileName);
                console.log(`[UploadDoc] ✅ Text extracted: ${rawText.length} chars`);

                if (rawText.trim().length < 30) {
                    return res.status(400).json({
                        error: 'No readable text found. Scanned/image-only documents are not supported.',
                        step: currentStep
                    });
                }

                // Step 4 — Upload raw blob to Supabase Storage (single upload — no double-upload)
                currentStep = 'STORAGE_UPLOAD';
                storagePath = await uploadToStorage(file.buffer, fileName, mimeType, req.user.id);
                publicUrl = getPublicUrl(storagePath);
            } else {
                // Step 3b — Text path (paste mode)
                currentStep = 'TEXT_INPUT';
                rawText = content!.trim();
                fileSize = Buffer.byteLength(rawText, 'utf-8');
                console.log(`[UploadDoc] Text pasted: ${rawText.length} chars`);
            }

            // Step 5 — Send extracted text to Gemini for structured analysis
            currentStep = 'GEMINI_ANALYSIS';
            console.log(`[UploadDoc] Calling Gemini cascade for analysis...`);
            const geminiResult = await callGeminiCascade(rawText, fileName);
            console.log(`[UploadDoc] ✅ Gemini analysis complete: ${geminiResult.documentType}`);

            // Step 6 — Save to DB via Prisma
            currentStep = 'DATABASE_SAVE';
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

            console.log(`[UploadDoc] ✅ Document saved: ${record.id}`);

            return res.status(200).json({
                ...record,
                status: 'completed',
            });

        } catch (err: any) {
            console.error(`[UploadDoc] ❌ FAIL at ${currentStep}:`, err.message);
            return res.status(500).json({
                error: err.message || 'Internal server error',
                step: currentStep,
            });
        }
    });
}
