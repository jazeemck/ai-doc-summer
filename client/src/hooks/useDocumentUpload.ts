import { useState } from 'react';
import type { SavedDocument } from '../components/DocumentUpload';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

type UploadInput =
    | { file: File; content?: never }
    | { content: string; file?: never };

export function useDocumentUpload() {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<SavedDocument | null>(null);

    async function upload(input: UploadInput): Promise<SavedDocument | null> {
        setIsLoading(true);
        setError(null);
        setResult(null);

        try {
            const formData = new FormData();
            formData.append('action', 'extract-document');

            if (input.file) {
                formData.append('file', input.file);
            } else {
                formData.append('content', input.content);
            }

            // Get JWT from localStorage (existing auth pattern)
            const token = localStorage.getItem('token');

            const response = await fetch(`${API_BASE_URL}/upload`, {
                method: 'POST',
                headers: {
                    // Do NOT set Content-Type — browser sets multipart/form-data with boundary
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Upload failed (${response.status})`);
            }

            const data: SavedDocument = await response.json();
            setResult(data);
            return data;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Upload failed';
            setError(message);
            return null;
        } finally {
            setIsLoading(false);
        }
    }

    function reset() {
        setError(null);
        setResult(null);
    }

    return { upload, isLoading, error, result, reset };
}
