const DEFAULT_MODEL = 'gemini-1.5-flash';
const CASCADE_MODELS = ['gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-2.0-flash'];
const EMBEDDING_MODEL = 'models/embedding-001';

export const aiService = {
    /**
     * Generates a streaming response from Gemini.
     * Implements a cascade fallback if quota is exceeded.
     */
    async generateContentStream(params: {
        model?: string;
        systemInstruction?: string;
        contents: any[];
    }) {
        const apiKey = process.env.GEMINI_API_KEY;
        const requestedModel = params.model;
        const modelsToTry = requestedModel ? [requestedModel, ...CASCADE_MODELS.filter(m => m !== requestedModel)] : CASCADE_MODELS;

        let lastError: any = null;

        for (const modelName of modelsToTry) {
            try {
                console.log(`[NeuralAI] Attempting generation with model: ${modelName}`);
                // Use v1beta for 2.0 and v1 for 1.5, or just v1beta for all (v1beta supports 1.5 too)
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?key=${apiKey}&alt=sse`;

                // Merged Request Body (NO separate systemInstruction or model field)
                const mergedContents = JSON.parse(JSON.stringify(params.contents));
                if (params.systemInstruction && mergedContents.length > 0) {
                    const firstPart = mergedContents[0].parts?.[0];
                    if (firstPart) {
                        firstPart.text = `${params.systemInstruction}\n\n${firstPart.text}`;
                    }
                } else if (params.systemInstruction) {
                    mergedContents.unshift({ role: 'user', parts: [{ text: params.systemInstruction }] });
                }

                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: mergedContents,
                        generationConfig: {
                            temperature: 0.7,
                            maxOutputTokens: 2048,
                        }
                    })
                });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    const msg = errData.error?.message || response.statusText || `Neural failure: ${response.status}`;

                    // If quota exceeded or limit 0, try next model
                    if (response.status === 429 || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('limit')) {
                        console.warn(`[NeuralAI] ${modelName} failed (quota/limit). Trying fallback...`);
                        lastError = new Error(msg);
                        continue;
                    }
                    throw new Error(msg);
                }

                console.log(`[NeuralAI] Model ${modelName} connected successfully.`);
                return this.makeAsyncIterator(response.body!);
            } catch (err: any) {
                lastError = err;
                if (err.message.toLowerCase().includes('quota') || err.message.toLowerCase().includes('limit')) {
                    continue;
                }
                throw err;
            }
        }

        throw new Error(`Neural failure: All model paths exhausted. Last error: ${lastError?.message}`);
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

    async generateEmbedding(text: string): Promise<number[] | null> {
        const apiKey = process.env.GEMINI_API_KEY;
        try {
            const url = `https://generativelanguage.googleapis.com/v1/models/embedding-001:embedContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'models/embedding-001',
                    content: { parts: [{ text: text.substring(0, 30000) }] }
                })
            });
            const data = await response.json();
            return data.embedding?.values || null;
        } catch {
            return null;
        }
    },

    async generateEmbeddingsBatch(chunks: string[]): Promise<number[][]> {
        if (chunks.length === 0) return [];
        const apiKey = process.env.GEMINI_API_KEY;
        try {
            const results: number[][] = [];
            const subBatchSize = 100;
            for (let i = 0; i < chunks.length; i += subBatchSize) {
                const subBatch = chunks.slice(i, i + subBatchSize);
                const url = `https://generativelanguage.googleapis.com/v1/models/embedding-001:batchEmbedContents?key=${apiKey}`;
                const requests = subBatch.map(text => ({
                    model: 'models/embedding-001',
                    content: { parts: [{ text: text.substring(0, 30000) }] }
                }));
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ requests })
                });
                const data = await response.json();
                const embeddings = data.embeddings?.map((e: any) => e.values) || [];
                results.push(...embeddings);
            }
            return results;
        } catch {
            const results: number[][] = [];
            for (const chunk of chunks) {
                const vector = await this.generateEmbedding(chunk);
                results.push(vector || new Array(768).fill(0));
            }
            return results;
        }
    }
};
