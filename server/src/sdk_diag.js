const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const aiV1 = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    apiVersion: 'v1'
});

async function testModel(client, modelName, label) {
    try {
        console.log(`\n--- Testing ${modelName} (${label}) ---`);
        const result = await client.models.generateContent({
          model: modelName,
          contents: [{ role: 'user', parts: [{ text: 'Say hi' }] }]
        });
        console.log(`Success with ${modelName}:`, result.text || JSON.stringify(result).substring(0, 50));
    } catch (err) {
        console.error(`Failed with ${modelName}:`, err.message);
    }
}

async function testEmbedding(client, modelName, label) {
    try {
        console.log(`\n--- Testing Embedding ${modelName} (${label}) ---`);
        const result = await client.models.embedContent({
            model: modelName,
            contents: 'Hello world'
        });
        console.log(`Success with ${modelName}:`, result.embeddings?.[0]?.values?.length, 'dims');
    } catch (err) {
        console.error(`Failed with ${modelName}:`, err.message);
    }
}

async function main() {
  try {
    const testModels = ['gemini-2.0-flash', 'gemini-1.5-flash'];
    const testEmbedModels = ['text-embedding-004', 'gemini-embedding-001'];
    
    console.log('Testing Default (Beta) Client:');
    for (const m of testModels) await testModel(ai, m, 'Beta');
    for (const m of testEmbedModels) await testEmbedding(ai, m, 'Beta');

    console.log('\nTesting V1 Client:');
    for (const m of testModels) await testModel(aiV1, m, 'V1');
    for (const m of testEmbedModels) await testEmbedding(aiV1, m, 'V1');

  } catch (err) {
    console.error('Main error:', err);
  }
}

main().catch(console.error);
