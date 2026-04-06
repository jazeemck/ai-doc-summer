import { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from './_lib/db';
import { withCORS } from './_lib/middleware';
import { aiService } from './_lib/ai';
import { supabase } from './_lib/supabase';
import { randomUUID } from 'crypto';
import multer from 'multer';

// 1. Vercel Payload Configuration
export const config = {
    api: {
        bodyParser: false, // Disabling bodyParser to handle raw multipart flow
    },
};

// 2. Memory Ingestion Engine (4.5MB Limit Guard)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 4.5 * 1024 * 1024 } // 4.5MB Production Limit
}).array('files');

/**
 * PRODUCTION HARDENED: Cloud-Direct Neural Ingestion
 */
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
        if (!req.user) return res.status(401).json({ error: 'Identity unknown.' });

        try {
            await runMiddleware(req, res, upload);
            const files = req.files as any[];

            if (!files || files.length === 0) return res.status(400).json({ error: 'No neural assets found.' });

            const uploadedDocs = [];

            // A. Infrastructure Verification
            const { data: buckets } = await supabase.storage.listBuckets();
            if (!buckets?.find(b => b.name === 'documents')) {
                await supabase.storage.createBucket('documents', { public: true });
            }

            for (const file of files) {
                const name = file.originalname || `doc_${Date.now()}.pdf`;
                const filePath = `${req.user.id}/${randomUUID()}_${name}`;

                // B. CLOUD STORAGE DEPLOYMENT
                const { error: storageError } = await supabase.storage
                    .from('documents')
                    .upload(filePath, file.buffer, {
                        contentType: file.mimetype,
                        upsert: true
                    });

                if (storageError) throw new Error(`Cloud Storage Fail: ${storageError.message}`);

                const { data: { publicUrl } } = supabase.storage
                    .from('documents')
                    .getPublicUrl(filePath);

                // C. NEURAL RECORD CREATION
                const document = await prisma.document.create({
                    data: {
                        name,
                        url: publicUrl,
                        size: file.size,
                        status: 'PROCESSING',
                        userId: req.user.id
                    }
                });
                uploadedDocs.push(document);

                // D. INTELLECTUAL EXTRACTION & BATCH EMBEDDING (Background simulation)
                (async () => {
                    let rawText = '';
                    try {
                        const ext = name.toLowerCase().split('.').pop();
                        if (ext === 'pdf') {
                            const pdfParse = require('pdf-parse');
                            const data = await pdfParse(file.buffer);
                            rawText = data.text;
                        } else if (ext === 'docx') {
                            const mammoth = require('mammoth');
                            const result = await mammoth.extractRawText({ buffer: file.buffer });
                            rawText = result.value;
                        } else {
                            rawText = file.buffer.toString('utf-8');
                        }

                        if (rawText.trim()) {
                            const chunks = (rawText.match(/[^.!?]+[.!?]+/g) || [rawText]).map(s => s.trim()).filter(s => s.length > 50);
                            const embeddings = await aiService.generateEmbeddingsBatch(chunks);

                            for (let i = 0; i < chunks.length; i++) {
                                if (embeddings[i]) {
                                    const vectorStr = `[${embeddings[i].join(',')}]`;
                                    await prisma.$executeRaw`
                                       INSERT INTO "Chunk" (id, content, "documentId", embedding)
                                       VALUES (${randomUUID()}, ${chunks[i]}, ${document.id}, ${vectorStr}::vector)
                                   `;
                                }
                            }
                        }
                        await prisma.document.update({ where: { id: document.id }, data: { status: 'COMPLETED' } });
                    } catch (e) {
                        await prisma.document.update({ where: { id: document.id }, data: { status: 'FAILED' } });
                    }
                })();
            }

            res.status(200).json({ documents: uploadedDocs });

        } catch (err: any) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ error: 'Payload too large! Vercel limit: 4.5MB.' });
            }
            res.status(500).json({ error: 'Neural ingestion failure.' });
        }
    });
}
