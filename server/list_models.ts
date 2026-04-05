import dotenv from 'dotenv';
dotenv.config();

async function listModels() {
    const apiKey = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        console.log("Models found:", data.models?.filter(m => m.name.includes('embed')).map(m => m.name));
    } catch (err) {
        console.error("Failed to list models", err);
    }
}

listModels();
