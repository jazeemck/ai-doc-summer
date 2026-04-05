const DEFAULT_MODEL = 'gemini-2.0-flash';
const EMBED_MODEL = 'gemini-embedding-2-preview';

export const aiService = {
  /**
   * Generates a streaming response from Gemini for text/logic.
   */
  async generateContentStream(params: {
    model?: string;
    systemInstruction?: string;
    contents: any[];
  }) {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('GEMINI_API_KEY_MISSING');

      const modelName = params.model || DEFAULT_MODEL;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?key=${apiKey}&alt=sse`;

      console.log(`[AIService] Generating stream with model: ${modelName}`);

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
    } catch (error: any) {
      console.error("Gemini API Error (Stream):", error);
      throw this.handleError(error);
    }
  },

  /**
   * Simple async iterator for fetch stream
   */
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
              yield data;
            } catch (e) {
              // Ignore partial JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  },

  /**
   * Generates an embedding for a piece of text with stable model fallback.
   */
  async generateEmbedding(text: string) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY_MISSING');

    // The current state-of-the-art for Gemini is text-embedding-004 (768d)
    // We will attempt that, then fallback to embedding-001 if needed.
    const models = ['text-embedding-004', 'embedding-001'];
    let lastError = null;

    const trimmedText = text.substring(0, 20000); // Guard rails

    for (const modelName of models) {
      try {
        console.log(`[AIService] Attempting embedding with model: ${modelName}...`);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:embedContent?key=${apiKey}`;

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: { parts: [{ text: trimmedText }] }
          })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          console.warn(`[AIService] Model ${modelName} failed (${response.status}):`, errData.error?.message);
          lastError = errData.error?.message || response.statusText;
          continue; // Try next model
        }

        const data = await response.json();
        const embedding = data.embedding?.values;

        if (embedding) {
          console.log(`[AIService] Success! Embedding size: ${embedding.length}`);
          return embedding;
        }
      } catch (error: any) {
        console.warn(`[AIService] Fatal error on model ${modelName}:`, error.message);
        lastError = error.message;
      }
    }

    throw new Error(`Embedding failed after trying all models. Last error: ${lastError}`);
  },

  /**
   * Generates embeddings in batch for high performance (up to 100 chunks at once).
   */
  async generateEmbeddingsBatch(chunks: string[]) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY_MISSING');

    const modelName = 'text-embedding-004';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:batchEmbedContents?key=${apiKey}`;

    try {
      console.log(`[AIService] Batching ${chunks.length} neural links via ${modelName}...`);

      const requests = chunks.map(text => ({
        model: `models/${modelName}`,
        content: { parts: [{ text: text.substring(0, 20000) }] }
      }));

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || response.statusText);
      }

      const data = await response.json();
      return data.embeddings?.map((e: any) => e.values) || [];
    } catch (error: any) {
      console.warn(`[AIService] Batch Embedding unsuccessful:`, error.message);
      // Fallback: process individually if batch fails
      const results = [];
      for (const chunk of chunks) {
        results.push(await this.generateEmbedding(chunk));
      }
      return results;
    }
  },

  /**
   * Enhanced Error Mapping
   */
  handleError(error: any): Error {
    const status = error.status;
    const messageStr = error.message || String(error);
    let message = "⚠️ AI temporarily unavailable. Try again.";

    if (status === 404 || messageStr.toLowerCase().includes('not found')) {
      message = "Invalid AI model configuration. Please check if the model is available in your region.";
    }
    else if (status === 429 || messageStr.includes('429')) {
      message = "Neural grid saturated (Too many requests). Wait a few seconds.";
    }
    else if (status === 400) {
      message = "Request invalid or text too large for processing.";
    }

    const enhancedError = new Error(message);
    (enhancedError as any).status = status || 500;
    return enhancedError;
  }
};
