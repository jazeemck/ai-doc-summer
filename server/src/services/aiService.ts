const DEFAULT_MODEL = 'gemini-2.0-flash';
const EMBED_MODEL = 'gemini-embedding-001';

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
   * Generates an embedding for a piece of text using native fetch.
   */
  async generateEmbedding(text: string) {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('GEMINI_API_KEY_MISSING');

      const trimmedText = text.substring(0, 30000);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: { parts: [{ text: trimmedText }] }
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw { status: response.status, message: errData.error?.message || response.statusText };
      }

      const data = await response.json();
      const embedding = data.embedding?.values;

      if (!embedding) {
        throw new Error('No embedding returned from Gemini API');
      }
      return embedding;
    } catch (error: any) {
      console.error("Gemini API Error (Embedding):", error);
      throw this.handleError(error);
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
