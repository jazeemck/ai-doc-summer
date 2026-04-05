import { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from './_lib/db';
import { withCORS } from './_lib/middleware';
import { aiService } from './_lib/ai';
import { randomUUID } from 'crypto';
import formidable from 'formidable';
import fs from 'fs';
import mammoth from 'mammoth';

export const config = {
    api: {
        bodyParser: false, // Disabling bodyParser for multipart form data
    },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    return withCORS(req, res, async (req: any, res: VercelResponse) => {
        if (!req.user) return res.status(401).json({ error: 'Auth failed.' });

        const form = new formidable.IncomingForm();
        form.parse(req, async (err, fields, files) => {
            if (err) return res.status(500).json({ error: 'Form parsing failed.' });

            const uploadedFiles = files.files ? (Array.isArray(files.files) ? files.files : [files.files]) : [];
            const uploadedDocs = [];

            for (const file of uploadedFiles) {
                try {
                    const buffer = fs.readFileSync(file.filepath);
                    const name = file.originalFilename || 'document.pdf';

                    // 1. Database Creation
                    const document = await prisma.document.create({
                        data: { name, size: file.size, status: 'PROCESSING', userId: req.user.id }
                    });
                    uploadedDocs.push(document);

                    // 2. Extraction & Batch Embedding
                    let rawText = '';
                    if (name.endsWith('.pdf')) {
                        const pdfParse = require('pdf-parse');
                        const data = await pdfParse(buffer);
                        rawText = data.text;
                    } else if (name.endsWith('.docx')) {
                        const result = await mammoth.extractRawText({ buffer });
                        rawText = result.value;
                    } else {
                        rawText = buffer.toString('utf-8');
                    }

                    if (rawText) {
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

                    // 3. Status Finalizer
                    await prisma.document.update({ where: { id: document.id }, data: { status: 'COMPLETED' } });

                } catch (syncErr: any) {
                    console.error(`[NeuralSync] Fail on ${file.originalFilename}:`, syncErr.message);
                }
            }
            res.status(200).json({ documents: uploadedDocs });
        });
    });
}
