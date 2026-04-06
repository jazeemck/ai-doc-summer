import { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from './_lib/db';
import { withCORS } from './_lib/middleware';
import { aiService } from './_lib/ai';
import { supabase } from './_lib/supabase';
import { randomUUID } from 'crypto';
import multer from 'multer';

// 1. ROBUST PARSER LOADING
const PDFParser = require("pdf2json");

export const config = {
    api: {
        bodyParser: false,
    },
};

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 4.5 * 1024 * 1024 }
}).single('file');

function runMiddleware(req: any, res: any, fn: any) {
    return new Promise((resolve, reject) => {
        fn(req, res, (result: any) => {
            if (result instanceof Error) return reject(result);
            return resolve(result);
        });
    });
}

/**
 * PRODUCTION HARDENED: Fire-and-Forget Vector Ingestion
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    return withCORS(req, res, async (req: any, res: VercelResponse) => {
        if (!req.user) return res.status(401).json({ error: 'Auth Link Interrupted.' });

        try {
            await runMiddleware(req, res, upload);
            const file = req.file;
            if (!file) return res.status(400).json({ error: 'No File Received.' });

            // A. CLOUD PERSISTENCE (Immediate Storage Upload)
            const fileName = file.originalname || `neural_${Date.now()}.pdf`;
            const filePath = `${req.user.id}/${randomUUID()}_${fileName}`;

            const { error: storageErr } = await supabase.storage
                .from('documents')
                .upload(filePath, file.buffer, { contentType: file.mimetype });

            if (storageErr) throw storageErr;

            const { data: { publicUrl } } = supabase.storage
                .from('documents')
                .getPublicUrl(filePath);

            // B. NEURAL RECORD INITIALIZATION (User Isolated)
            const document = await prisma.document.create({
                data: {
                    name: fileName,
                    url: publicUrl,
                    size: file.size,
                    userId: req.user.id,
                    status: 'PROCESSING'
                }
            });

            // C. FIRE-AND-FORGET INGESTION (Background Execution to prevent Timeouts)
            const processIngestion = async () => {
                const pdfParser = new PDFParser(null, 1);

                pdfParser.on("pdfParser_dataError", async (errData: any) => {
                    console.error('[NeuralIngest] Parse Fail:', errData.parserError);
                    await prisma.document.update({ where: { id: document.id }, data: { status: 'FAILED' } });
                });

                pdfParser.on("pdfParser_dataReady", async () => {
                    try {
                        const rawText = pdfParser.getRawTextContent().replace(/\r\n/g, " ");

                        // D. SEMANTIC CHUNKING (400 words, 50-word overlap)
                        const words = rawText.split(/\s+/);
                        const chunks: string[] = [];
                        const chunkSize = 400;
                        const overlap = 50;

                        for (let i = 0; i < words.length; i += (chunkSize - overlap)) {
                            const chunk = words.slice(i, i + chunkSize).join(' ');
                            if (chunk.trim().length > 10) chunks.push(chunk);
                            if (i + chunkSize >= words.length) break;
                        }

                        // E. BATCH EMBEDDING & TRANSACTIONAL STORAGE (Performance Fix)
                        if (chunks.length > 0) {
                            const embeddings = await aiService.generateEmbeddingsBatch(chunks);

                            // USING PRISMA TRANSACTION FOR BATCH INSERT PERFORMANCE
                            await prisma.$transaction(
                                chunks.map((chunk, i) => {
                                    const vectorStr = `[${embeddings[i].join(',')}]`;
                                    return prisma.$executeRaw`
                                        INSERT INTO "Chunk" (id, content, "documentId", embedding, "userId")
                                        VALUES (${randomUUID()}, ${chunk}, ${document.id}, ${vectorStr}::vector, ${req.user.id})
                                    `;
                                })
                            );
                        }

                        await prisma.document.update({ where: { id: document.id }, data: { status: 'COMPLETED' } });
                    } catch (e: any) {
                        console.error('[NeuralIngest] Batch Error:', e.message);
                        await prisma.document.update({ where: { id: document.id }, data: { status: 'FAILED' } });
                    }
                });

                pdfParser.parseBuffer(file.buffer);
            };

            // Initiate background pulse
            processIngestion();

            // D. INSTANT NEURAL ACKNOWLEDGMENT
            res.status(200).json({
                status: "processing",
                message: "PDF upload successful, processing started",
                documentId: document.id
            });

        } catch (err: any) {
            console.error('[NeuralIngest] Request Fail:', err.message);
            res.status(500).json({ error: err.message || 'Internal Neural Failure' });
        }
    });
}
