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
 * PRODUCTION HARDENED: Traceable Neural Ingestion
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    return withCORS(req, res, async (req: any, res: VercelResponse) => {
        let currentStep = "INITIALIZATION";

        try {
            // STEP 1: IDENTITY PULSE
            currentStep = "AUTH_VERIFICATION";
            if (!req.user) {
                console.error(`[NeuralUpload] FAIL at ${currentStep}: No user context found in request.`);
                return res.status(401).json({ error: 'Auth Link Interrupted.', step: currentStep });
            }
            console.log(`[NeuralUpload] STEP 1: AUTH_OK for user ${req.user.id}`);

            // STEP 2: MULTER INGRESS
            currentStep = "MULTIPART_INGESTION";
            await runMiddleware(req, res, upload);
            const file = req.file;
            if (!file) {
                console.error(`[NeuralUpload] FAIL at ${currentStep}: No file buffer extracted.`);
                return res.status(400).json({ error: 'No File Received.', step: currentStep });
            }
            console.log(`[NeuralUpload] STEP 2: FILE_INGESTED_OK - size: ${file.size} bytes`);

            // STEP 3: CLOUD PERSISTENCE
            currentStep = "SUPABASE_UPLOAD";
            const fileName = file.originalname || `neural_${Date.now()}.pdf`;
            const filePath = `${req.user.id}/${randomUUID()}_${fileName}`;
            console.log(`[NeuralUpload] STEP 3: Attempting Cloud Storage upload to path: ${filePath}`);

            const { error: storageErr } = await supabase.storage
                .from('documents')
                .upload(filePath, file.buffer, { contentType: file.mimetype });

            if (storageErr) {
                console.error(`[NeuralUpload] FAIL at ${currentStep}: Supabase Storage Error:`, storageErr.message);
                throw new Error(`Supabase Storage Fail: ${storageErr.message}`);
            }

            const { data: { publicUrl } } = supabase.storage
                .from('documents')
                .getPublicUrl(filePath);
            console.log(`[NeuralUpload] STEP 3: CLOUD_PERSISTENCE_OK - URL: ${publicUrl}`);

            // STEP 4: NEURAL RECORD INITIALIZATION
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
            console.log(`[NeuralUpload] STEP 4: DB_RECORD_OK - Doc ID: ${document.id}`);

            // STEP 5: BACKGROUND PROCESSING PULSE
            const processIngestion = async () => {
                let bgStep = "BACKGROUND_INITIALIZATION";
                try {
                    // STEP 5.1: PDF PARSING
                    bgStep = "PDF_PARSING";
                    console.log(`[NeuralUpload] BG_STEP 5.1: Starting PDF Parse for doc ${document.id}`);
                    const pdfParser = new PDFParser(null, 1);

                    pdfParser.on("pdfParser_dataError", async (errData: any) => {
                        console.error(`[NeuralUpload] BG_FAIL at ${bgStep}: Parser error:`, errData.parserError);
                        await prisma.document.update({ where: { id: document.id }, data: { status: 'FAILED' } });
                    });

                    pdfParser.on("pdfParser_dataReady", async () => {
                        try {
                            // STEP 5.2: TEXT EXTRACTION
                            bgStep = "TEXT_EXTRACTION";
                            const rawText = pdfParser.getRawTextContent().replace(/\r\n/g, " ");
                            console.log(`[NeuralUpload] BG_STEP 5.2: Extraction OK - ${rawText.length} characters`);

                            // STEP 5.3: SEMANTIC CHUNKING
                            bgStep = "SEMANTIC_CHUNKING";
                            const words = rawText.split(/\s+/);
                            const chunks: string[] = [];
                            const chunkSize = 400;
                            const overlap = 50;

                            for (let i = 0; i < words.length; i += (chunkSize - overlap)) {
                                const chunk = words.slice(i, i + chunkSize).join(' ');
                                if (chunk.trim().length > 10) chunks.push(chunk);
                                if (i + chunkSize >= words.length) break;
                            }
                            console.log(`[NeuralUpload] BG_STEP 5.3: Chunking OK - ${chunks.length} segments identified`);

                            // STEP 5.4: BATCH EMBEDDING
                            bgStep = "BATCH_EMBEDDING";
                            if (chunks.length > 0) {
                                console.log(`[NeuralUpload] BG_STEP 5.4: Generating embeddings for ${chunks.length} chunks via Gemini...`);
                                const embeddings = await aiService.generateEmbeddingsBatch(chunks);
                                console.log(`[NeuralUpload] BG_STEP 5.4: Batch Embedding OK - Received ${embeddings.length} vectors`);

                                // STEP 5.5: VECTOR TRANSACTION
                                bgStep = "VECTOR_TRANSACTION";
                                await prisma.$transaction(
                                    chunks.map((chunk, i) => {
                                        const vectorStr = `[${embeddings[i].join(',')}]`;
                                        return prisma.$executeRaw`
                                            INSERT INTO "Chunk" (id, content, "documentId", embedding, "userId")
                                            VALUES (${randomUUID()}, ${chunk}, ${document.id}, ${vectorStr}::vector, ${req.user.id})
                                        `;
                                    })
                                );
                                console.log(`[NeuralUpload] BG_STEP 5.5: DB_TRANSACTION_OK - Upload Complete.`);
                            }

                            await prisma.document.update({ where: { id: document.id }, data: { status: 'COMPLETED' } });
                        } catch (e: any) {
                            console.error(`[NeuralUpload] BG_FAIL at ${bgStep}:`, e.message);
                            await prisma.document.update({ where: { id: document.id }, data: { status: 'FAILED' } });
                        }
                    });

                    pdfParser.parseBuffer(file.buffer);
                } catch (err: any) {
                    console.error(`[NeuralUpload] BG_CRITICAL_FAIL at ${bgStep}:`, err.message);
                    await prisma.document.update({ where: { id: document.id }, data: { status: 'FAILED' } });
                }
            };

            // INITIATE BACKGROUND SYNC
            processIngestion();

            // STEP 6: INSTANT NEURAL ACKNOWLEDGMENT
            res.status(200).json({
                status: "processing",
                message: "PDF upload successful, processing started",
                documentId: document.id
            });

        } catch (err: any) {
            console.error(`[NeuralUpload] CRITICAL_FAIL at ${currentStep}:`, err.message);
            res.status(500).json({
                error: err.message || 'Internal Neural Failure',
                step: currentStep
            });
        }
    });
}
