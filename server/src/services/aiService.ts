import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  apiVersion: 'v1beta' // Crucial for systemInstruction and latest models
});

const DEFAULT_MODEL = 'gemini-flash-latest';
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
      const modelName = params.model || DEFAULT_MODEL;
      console.log(`[AIService] Generating stream with model: ${modelName}`);

      const payload: any = {
        model: modelName,
        contents: params.contents,
      };

      if (params.systemInstruction) {
        payload.config = {
          systemInstruction: {
            parts: [{ text: params.systemInstruction }]
          }
        };
      }

      return await (ai.models as any).generateContentStream(payload);
    } catch (error: any) {
      console.error("Gemini API Error (Stream):", {
        status: error.status,
        message: error.message,
        details: error
      });
      throw this.handleError(error);
    }
  },

  /**
   * Generates an embedding for a piece of text.
   */
  async generateEmbedding(text: string) {
    try {
      const trimmedText = text.substring(0, 10000); 
      
      const result = await ai.models.embedContent({
        model: EMBED_MODEL,
        contents: trimmedText,
      });

      const embedding = result.embedding?.values || result.embeddings?.[0]?.values;
      
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
    const messageStr = error.message || '';
    let message = "⚠️ AI temporarily unavailable. Try again.";

    // Logic for Model Failures
    if (status === 404 || messageStr.toLowerCase().includes('model not found')) {
      message = "Invalid AI model configuration (Model not found). Check service availability.";
    } 
    // Logic for Key Failures
    else if (messageStr === 'OPENAI_API_KEY_MISSING') {
      message = "OpenAI API Key is missing. Check system environment variables.";
    } 
    // Logic for Rate Limiting
    else if (status === 429 || messageStr.includes('429')) {
      message = "Neural grid saturated (Too many requests). Wait a few seconds.";
    } 
    // Logic for Invalid Requests
    else if (status === 400 || messageStr.includes('EMPTY_TRANSCRIPTION')) {
      message = "Request too large or invalid neural signal.";
    }

    const enhancedError = new Error(message);
    (enhancedError as any).status = status || 500;
    return enhancedError;
  }
};
