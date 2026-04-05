import dotenv from 'dotenv';
dotenv.config();

async function testGemini() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("No API Key found");
        return;
    }
    console.log("Testing with key:", apiKey.substring(0, 10));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: { parts: [{ text: "Hello, world!" }] }
            })
        });

        if (!response.ok) {
            const err = await response.json();
            console.error("Error response:", JSON.stringify(err, null, 2));
        } else {
            const data = await response.json();
            console.log("Success! Embedding length:", data.embedding?.values?.length);
        }
    } catch (err) {
        console.error("Fetch failed:", err);
    }
}

testGemini();
