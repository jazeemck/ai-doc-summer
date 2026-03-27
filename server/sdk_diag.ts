import { GenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const ai = new GenAI(process.env.GEMINI_API_KEY || '');

async function test() {
  try {
    console.log('Testing with explicit system role...');
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      config: {
        systemInstruction: { role: 'system', parts: [{ text: 'You are a helpful assistant.' }] }
      },
      contents: [{ role: 'user', parts: [{ text: 'Hello' }] }]
    });
    console.log('Success:', JSON.stringify(response.candidates[0].content, null, 2));
  } catch (error) {
    console.error('Failed:', error.message);
    if (error.error) console.error('Details:', JSON.stringify(error.error, null, 2));
    else console.error('Full error:', error);
  }
}

test();
