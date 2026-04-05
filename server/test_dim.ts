import dotenv from 'dotenv';
dotenv.config();

async function testEmbedding2() {
    const apiKey = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2-preview:embedContent?key=${apiKey}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: { parts: [{ text: "Test Dimension" }] }
            })
        });
        const data = await response.json();
        console.log("Success! Dimension:", data.embedding?.values?.length);
    } catch (err) {
        console.error("Test failed", err);
    }
}

testEmbedding2();
