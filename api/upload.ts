import { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from './_lib/db';
import { withCORS } from './_lib/middleware';
import { aiService } from './_lib/ai';
import { supabase } from './_lib/supabase';
import { randomUUID } from 'crypto';
import formidable from 'formidable';
import fs from 'fs';
import mammoth from 'mammoth';

export const config = {
    api: {
        bodyParser: false,
    },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    return withCORS(req, res, async (req: any, res: VercelResponse) => {
        if (!req.user) return res.status(401).json({ error: 'Identity unknown.' });

        const form = new formidable.IncomingForm();
        form.parse(req, async (err, fields, files) => {
            if (err) return res.status(500).json({ error: 'Form parsing failed.' });

            // Ensure bucket exists
            const { data: buckets } = await supabase.storage.listBuckets();
            if (!buckets?.find(b => b.name === 'documents')) {
                await supabase.storage.createBucket('documents', { public: true });
                console.log('[CloudSync] Initialized "documents" bucket.');
            }

            const uploadedFiles = files.files ? (Array.isArray(files.files) ? files.files : [files.files]) : [];
            const uploadedDocs = [];

            for (const file of uploadedFiles) {
                try {
                    const buffer = fs.readFileSync(file.filepath);
                    const name = file.originalFilename || `doc_${Date.now()}.pdf`;
                    const filePath = `${req.user.id}/${randomUUID()}_${name}`;

                    // 1. UPLOAD TO SUPABASE STORAGE
                    const { data: storageData, error: storageError } = await supabase.storage
                        .from('documents')
                        .upload(filePath, buffer, {
                            contentType: file.mimetype || 'application/pdf',
                            upsert: true
                        });

                    if (storageError) throw new Error(`Supabase Storage Fail: ${storageError.message}`);

                    const { data: { publicUrl } } = supabase.storage
                        .from('documents')
                        .getPublicUrl(filePath);

                    // 2. CREATE PRISMA RECORD
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

                    // 3. NEURAL EXTRACTION & BATCH EMBEDDING
                    let rawText = '';
                    const ext = name.toLowerCase().split('.').pop();

                    if (ext === 'pdf') {
                        const pdfParse = require('pdf-parse');
                        const data = await pdfParse(buffer);
                        rawText = data.text;
                    } else if (ext === 'docx') {
                        const result = await mammoth.extractRawText({ buffer });
                        rawText = result.value;
                    } else {
                        rawText = buffer.toString('utf-8');
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

                    // 4. SYNC COMPLETED
                    await prisma.document.update({
                        where: { id: document.id },
                        data: { status: 'COMPLETED' }
                    });

                } catch (syncErr: any) {
                    console.error(`[CloudSync] Neural Fail:`, syncErr.message);
                }
            }
            res.status(200).json({ documents: uploadedDocs });
        });
    });
}
