const DEFAULT_MODEL = 'gemini-1.5-flash-latest';
const EMBEDDING_MODEL = 'models/embedding-001';

export const aiService = {
    /**
     * Generates a streaming response from Gemini.
     */
    async generateContentStream(params: {
        model?: string;
        systemInstruction?: string;
        contents: any[];
    }) {
        const apiKey = process.env.GEMINI_API_KEY;
        const modelName = params.model || DEFAULT_MODEL;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?key=${apiKey}&alt=sse`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: params.contents,
                systemInstruction: params.systemInstruction ? {
                    parts: [{ text: params.systemInstruction }]
                } : undefined
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw { status: response.status, message: errData.error?.message || response.statusText };
        }

        return this.makeAsyncIterator(response.body!);
    },

    async *makeAsyncIterator(stream: ReadableStream) {
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const jsonStr = line.replace('data: ', '');
                            if (jsonStr.trim() === '[DONE]') continue;
                            const data = JSON.parse(jsonStr);
                            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                            if (text) yield { text };
                        } catch (e) { }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    },

    /**
     * COMPATIBILITY WRAPPER: Implements v1:embedText fallback
     */
    async generateEmbedding(text: string): Promise<number[] | null> {
        const apiKey = process.env.GEMINI_API_KEY;
        console.log(`[AI] Handshaking with Neural Model: ${EMBEDDING_MODEL}`);

        try {
            // Priority: User Specified REST Path
            const url = `https://generativelanguage.googleapis.com/v1/${EMBEDDING_MODEL}:embedText?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: EMBEDDING_MODEL,
                    text: text.substring(0, 30000)
                })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message);

            console.log('[AI] Neural Response Verified (v1:embedText)');
            return data.embedding?.values || null;

        } catch (err: any) {
            console.warn('[AI] Primary Handshake Failed, falling back to v1beta...', err.message);
            try {
                const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`;
                const response = await fetch(fallbackUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        content: { parts: [{ text: text.substring(0, 30000) }] }
                    })
                });
                const data = await response.json();
                return data.embedding?.values || null;
            } catch (fallbackErr) {
                console.error('[AI] All Neural Pathways Interrupted. Skipping Embedding.');
                return null;
            }
        }
    },

    async generateEmbeddingsBatch(chunks: string[]): Promise<number[][]> {
        if (chunks.length === 0) return [];
        const apiKey = process.env.GEMINI_API_KEY;
        console.log(`[AI] Batch Processing ${chunks.length} nodes using ${EMBEDDING_MODEL}`);

        try {
            const results: number[][] = [];
            const subBatchSize = 50; // API Payload Limit Safety

            for (let i = 0; i < chunks.length; i += subBatchSize) {
                const subBatch = chunks.slice(i, i + subBatchSize);
                const url = `https://generativelanguage.googleapis.com/v1beta/${EMBEDDING_MODEL}:batchEmbedContents?key=${apiKey}`;
                const requests = subBatch.map(text => ({
                    model: EMBEDDING_MODEL,
                    content: { parts: [{ text: text.substring(0, 30000) }] }
                }));

                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ requests })
                });

                const data = await response.json();
                if (data.error) throw new Error(data.error.message);

                const embeddings = data.embeddings?.map((e: any) => e.values) || [];
                results.push(...embeddings);
            }

            return results;

        } catch (err: any) {
            console.warn('[AI] Batch Neural Sync Interrupted. Switching to Sequential Fallback...', err.message);
            const results: number[][] = [];
            for (const chunk of chunks) {
                const vector = await this.generateEmbedding(chunk);
                results.push(vector || new Array(768).fill(0));
            }
            return results;
        }
    }
};
