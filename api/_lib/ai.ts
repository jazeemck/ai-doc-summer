const DEFAULT_MODEL = 'gemini-1.5-flash-latest';
const EMBEDDING_MODEL = 'embedding-001';

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

    async generateEmbedding(text: string) {
        const apiKey = process.env.GEMINI_API_KEY;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: { parts: [{ text: text.substring(0, 30000) }] }
            })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        return data.embedding?.values;
    },

    async generateEmbeddingsBatch(chunks: string[]) {
        if (chunks.length === 0) return [];
        const apiKey = process.env.GEMINI_API_KEY;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents?key=${apiKey}`;

        const requests = chunks.map(text => ({
            model: `models/${EMBEDDING_MODEL}`,
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
        if (embeddings.length !== chunks.length) {
            console.warn(`[AI] Embedding count mismatch: ${embeddings.length} vs ${chunks.length}`);
        }
        return embeddings;
    }
};
