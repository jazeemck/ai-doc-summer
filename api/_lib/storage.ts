/**
 * Supabase Storage Upload Helper — Single Upload (no client-side duplication)
 */
import { supabase } from './supabase';

const BUCKET = 'documents';

export async function uploadToStorage(
    buffer: Buffer,
    fileName: string,
    mimeType: string,
    userId: string
): Promise<string> {
    // Unique path: userId/timestamp-originalName avoids collisions
    const timestamp = Date.now();
    const storagePath = `${userId}/${timestamp}-${fileName}`;

    console.log(`[Storage] Uploading to ${BUCKET}/${storagePath} (${buffer.length} bytes)`);

    const { error } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, buffer, {
            contentType: mimeType,
            upsert: false,
        });

    if (error) {
        throw new Error(`Supabase Storage upload failed: ${error.message}`);
    }

    console.log(`[Storage] ✅ Upload complete: ${storagePath}`);
    return storagePath;
}

export function getPublicUrl(storagePath: string): string {
    const { data: { publicUrl } } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(storagePath);
    return publicUrl;
}
