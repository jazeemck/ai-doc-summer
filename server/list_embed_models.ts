import dotenv from 'dotenv';
dotenv.config();

async function listEmbeddingModels() {
    const apiKey = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        const embeddingModels = data.models?.filter(m => m.supportedGenerationMethods.includes('embedContent'));
        console.log("Supported Embedding Models:", embeddingModels.map(m => m.name));
    } catch (err) {
        console.error("List failed", err);
    }
}

listEmbeddingModels();
