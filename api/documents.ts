import { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from './_lib/db';
import { withCORS } from './_lib/middleware';
import { supabase } from './_lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    return withCORS(req, res, async (req: any, res: VercelResponse) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized: Neural link not established.' });
        }

        // ── GET: LIST DOCUMENTS ──────────────────────────────────────────
        if (req.method === 'GET') {
            try {
                const documents = await prisma.document.findMany({
                    where: { userId: req.user.id },
                    orderBy: { createdAt: 'desc' }
                });
                return res.status(200).json(documents);
            } catch (err: any) {
                console.error('[API Documents Error]', err);
                return res.status(500).json({ error: 'Failed to retrieve neural memories.' });
            }
        }

        // ── DELETE: REMOVE DOCUMENT ───────────────────────────────────────
        if (req.method === 'DELETE') {
            const { id } = req.query as { id: string };
            if (!id) return res.status(400).json({ error: 'System error: Document ID missing.' });

            try {
                // Find the document first to check ownership and storage path
                const document = await prisma.document.findFirst({
                    where: { id, userId: req.user.id }
                });

                if (!document) {
                    return res.status(404).json({ error: 'Neural fragment not found or unauthorized.' });
                }

                // 1. Delete associated chunks first (manual cleanup fallback)
                await prisma.chunk.deleteMany({ where: { documentId: id } });

                // 2. Delete from Supabase Storage if path exists
                if (document.storagePath) {
                    console.log(`[API Documents] Deleting blob: ${document.storagePath}`);
                    const { error } = await supabase.storage
                        .from('documents')
                        .remove([document.storagePath]);

                    if (error) console.error(`[API Documents] Supabase Storage delete fail:`, error.message);
                }

                // 3. Delete DB record
                await prisma.document.delete({ where: { id } });

                return res.status(200).json({ success: true, message: 'Neural fragment purged.' });

            } catch (err: any) {
                console.error('[API Documents DELETE Error]', err);
                return res.status(500).json({ error: 'Failed to purge neural memory: ' + err.message });
            }
        }

        return res.status(405).json({ error: 'Method not allowed.' });
    });
}
