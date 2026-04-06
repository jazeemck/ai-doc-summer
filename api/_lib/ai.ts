const DEFAULT_MODEL = 'gemini-2.0-flash';

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
        const modelName = 'embedding-001';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:embedContent?key=${apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: { parts: [{ text: text.substring(0, 20000) }] }
            })
        });

        const data = await response.json();
        return data.embedding?.values;
    },

    async generateEmbeddingsBatch(chunks: string[]) {
        const apiKey = process.env.GEMINI_API_KEY;
        const modelName = 'embedding-001';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:batchEmbedContents?key=${apiKey}`;

        const requests = chunks.map(text => ({
            model: `models/${modelName}`,
            content: { parts: [{ text: text.substring(0, 20000) }] }
        }));

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requests })
        });

        const data = await response.json();
        return data.embeddings?.map((e: any) => e.values) || [];
    }
};
