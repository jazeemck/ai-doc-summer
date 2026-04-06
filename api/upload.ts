import { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from './_lib/db';
import { withCORS } from './_lib/middleware';
import { aiService } from './_lib/ai';
import { supabase } from './_lib/supabase';
import { randomUUID } from 'crypto';
import multer from 'multer';
import PDFParser from 'pdf2json';

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
 * PRODUCTION HARDENED: Robust Semantic PDF Ingestion
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    return withCORS(req, res, async (req: any, res: VercelResponse) => {
        if (!req.user) return res.status(401).json({ error: 'Auth Link Interrupted.' });

        try {
            await runMiddleware(req, res, upload);
            const file = req.file;
            if (!file) return res.status(400).json({ error: 'No File Received.' });

            // 1. CLOUD PERSISTENCE (Supabase Storage)
            const fileName = file.originalname || `neural_${Date.now()}.pdf`;
            const filePath = `${req.user.id}/${randomUUID()}_${fileName}`;

            const { error: storageErr } = await supabase.storage
                .from('documents')
                .upload(filePath, file.buffer, { contentType: file.mimetype });

            if (storageErr) throw storageErr;

            const { data: { publicUrl } } = supabase.storage
                .from('documents')
                .getPublicUrl(filePath);

            // 2. INITIAL DOCUMENT RECORD (User Isolated)
            const document = await prisma.document.create({
                data: {
                    name: fileName,
                    url: publicUrl,
                    size: file.size,
                    userId: req.user.id,
                    status: 'PROCESSING'
                }
            });

            // 3. PARSING & INGESTION PROMISE (Awaiting for Serverless sync)
            await new Promise((resolve, reject) => {
                const pdfParser = new (PDFParser as any)(null, 1);

                pdfParser.on("pdfParser_dataError", (errData: any) => {
                    reject(new Error(errData.parserError));
                });

                pdfParser.on("pdfParser_dataReady", async () => {
                    try {
                        const rawText = pdfParser.getRawTextContent().replace(/\r\n/g, " ");

                        // 4. SEMANTIC CHUNKING (400 words, 50-word overlap)
                        const words = rawText.split(/\s+/);
                        const chunks: string[] = [];
                        const chunkSize = 400;
                        const overlap = 50;

                        for (let i = 0; i < words.length; i += (chunkSize - overlap)) {
                            const chunk = words.slice(i, i + chunkSize).join(' ');
                            if (chunk.trim().length > 10) chunks.push(chunk);
                            if (i + chunkSize >= words.length) break;
                        }

                        // 5. GEMINI EMBEDDINGS (768D)
                        if (chunks.length > 0) {
                            const embeddings = await aiService.generateEmbeddingsBatch(chunks);

                            for (let i = 0; i < chunks.length; i++) {
                                if (embeddings[i]) {
                                    const vectorStr = `[${embeddings[i].join(',')}]`;
                                    await prisma.$executeRaw`
                                        INSERT INTO "Chunk" (id, content, "documentId", embedding, "userId")
                                        VALUES (${randomUUID()}, ${chunks[i]}, ${document.id}, ${vectorStr}::vector, ${req.user.id})
                                    `;
                                }
                            }
                        }

                        await prisma.document.update({ where: { id: document.id }, data: { status: 'COMPLETED' } });
                        resolve(true);
                    } catch (e) {
                        await prisma.document.update({ where: { id: document.id }, data: { status: 'FAILED' } });
                        reject(e);
                    }
                });

                pdfParser.parseBuffer(file.buffer);
            });

            res.status(200).json({ status: 'success', message: 'PDF ingested successfully' });

        } catch (err: any) {
            console.error('[NeuralIngest] Fail:', err.message);
            res.status(500).json({ error: err.message || 'Internal Neural Failure' });
        }
    });
}
