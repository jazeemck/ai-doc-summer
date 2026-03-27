import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  apiVersion: 'v1beta'
});

async function testEmbedding() {
  try {
    console.log('Testing embedding...');
    const result = await ai.models.embedContent({
      model: 'gemini-embedding-001',
      contents: 'This is a test message to check embedding structure.'
    });

    console.log('Full result structure:', JSON.stringify(result, null, 2));
    
    // Check various paths
    if (result.embedding) {
      console.log('Found embedding.values:', !!result.embedding.values);
    }
    if (result.embeddings) {
       console.log('Found embeddings[0].values:', !!result.embeddings[0]?.values);
    }
  } catch (error) {
    console.error('Embedding test failed:', error);
  }
}

testEmbedding();
