import { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from './_lib/db';
import { withCORS } from './_lib/middleware';
import { aiService } from './_lib/ai';
import { supabase } from './_lib/supabase';
import { randomUUID } from 'crypto';
import multer from 'multer';

const PDFParser = require("pdf2json");

export const config = {
    api: {
        bodyParser: false,
    },
};

// Switching to any() temporarily to debug hidden fields in the multipart stream
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
            currentStep = "AUTH_VERIFICATION";
            if (!req.user) return res.status(401).json({ error: 'Auth Link Interrupted.', step: currentStep });

            currentStep = "MULTIPART_INGESTION";
            await runMiddleware(req, res, upload);

            // LOGGING HIDDEN FIELDS FOR NEURAL DEBUGGING
            const files = req.files as any[];
            if (!files || files.length === 0) {
                console.error(`[NeuralUpload] FAIL at ${currentStep}: No file buffer extracted.`);
                return res.status(400).json({ error: 'No File Received.', step: currentStep });
            }

            // Pick the first file found (should be 'file')
            const file = files[0];
            console.log(`[NeuralUpload] STEP 2: INGESTED_OK - Field: ${file.fieldname}, Size: ${file.size} bytes`);

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

            currentStep = "DATABASE_RECORD_INIT";
            const document = await prisma.document.create({
                data: {
                    name: fileName,
                    url: publicUrl,
                    size: file.size,
                    userId: req.user.id,
                    status: 'PROCESSING'
                }
            });

            // 3. SYNCHRONIZED NEURAL INGESTION (Requirement for Serverless Lifecycle)
            await new Promise((resolve, reject) => {
                let bgStep = "BACKGROUND_INITIALIZATION";
                try {
                    const pdfParser = new PDFParser(null, 1);

                    pdfParser.on("pdfParser_dataError", async (errData: any) => {
                        console.error(`[NeuralUpload] PDF Parse Error: ${errData.parserError}`);
                        await prisma.document.update({ where: { id: document.id }, data: { status: 'FAILED' } });
                        reject(new Error(errData.parserError));
                    });

                    pdfParser.on("pdfParser_dataReady", async () => {
                        try {
                            bgStep = "TEXT_EXTRACTION";
                            const rawText = (pdfParser.getRawTextContent() || "").replace(/\r\n/g, " ");

                            bgStep = "SEMANTIC_CHUNKING";
                            const words = rawText.split(/\s+/);
                            const chunks: string[] = [];
                            const chunkSize = 500;
                            const overlap = 50;

                            for (let i = 0; i < words.length; i += (chunkSize - overlap)) {
                                const chunk = words.slice(i, i + chunkSize).join(' ');
                                if (chunk.trim().length > 10) chunks.push(chunk);
                                if (i + chunkSize >= words.length) break;
                            }

                            if (chunks.length === 0) {
                                await prisma.document.update({ where: { id: document.id }, data: { status: 'FAILED' } });
                                resolve(null);
                                return;
                            }

                            bgStep = "BATCH_EMBEDDING";
                            const embeddings = await aiService.generateEmbeddingsBatch(chunks);

                            if (!embeddings || embeddings.length === 0) {
                                throw new Error("Zero embeddings returned from Neural Intelligence Engine.");
                            }

                            bgStep = "VECTOR_TRANSACTION";
                            await prisma.$transaction(
                                chunks.map((chunk, i) => {
                                    if (!embeddings[i]) return prisma.$executeRaw`SELECT 1`; // Skip if no embedding for this row
                                    const vectorStr = `[${embeddings[i].join(',')}]`;
                                    return prisma.$executeRawUnsafe(`
                                        INSERT INTO "Chunk" (id, content, "documentId", embedding, "userId")
                                        VALUES ('${randomUUID()}', ${JSON.stringify(chunk)}, '${document.id}', '${vectorStr}'::vector, '${req.user.id}')
                                    `);
                                })
                            );

                            await prisma.document.update({ where: { id: document.id }, data: { status: 'COMPLETED' } });
                            console.log(`[NeuralUpload] SUCCESS: ${chunks.length} nodes integrated for document ${document.id}`);
                            resolve(null);
                        } catch (e: any) {
                            console.error(`[NeuralUpload] Ingestion FAIL at ${bgStep}:`, e.message);
                            await prisma.document.update({ where: { id: document.id }, data: { status: 'FAILED' } });
                            reject(e);
                        }
                    });

                    pdfParser.parseBuffer(file.buffer);
                } catch (err: any) {
                    console.error("[NeuralUpload] Synchronous Failure:", err);
                    reject(err);
                }
            });

            res.status(200).json({ status: "completed", documentId: document.id });

        } catch (err: any) {
            console.error(`[NeuralUpload] CRITICAL_FAIL at ${currentStep}:`, err.message);
            res.status(500).json({ error: err.message, step: currentStep });
        }
    });
}
