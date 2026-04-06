/**
 * Gemini Model Cascade — Document Analysis
 * Tries gemini-2.5-flash → gemini-2.0-flash → gemini-1.5-flash-001
 */

const GEMINI_MODELS = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash-001',
] as const;

export type GeminiDocumentResult = {
    summary: string;
    keyPoints: string[];
    documentType: 'resume' | 'report' | 'contract' | 'other';
    topics: string[];
};

type GeminiApiResponse = {
    candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
    }>;
};

// ── Public API ────────────────────────────────────────────────────────────
export async function callGeminiCascade(
    text: string,
    fileName: string
): Promise<GeminiDocumentResult> {
    const prompt = buildPrompt(text, fileName);
    const raw = await cascade(prompt);
    return parseResponse(raw);
}

// ── Build prompt ─────────────────────────────────────────────────────────
function buildPrompt(text: string, fileName: string): string {
    return `
You are a document analysis assistant.
Analyse the following document "${fileName}" and return ONLY a valid JSON object.
No markdown fences. No preamble. No extra text.

Return this exact shape:
{
  "summary":      "2-3 sentence summary of the document",
  "keyPoints":    ["key point 1", "key point 2", "key point 3"],
  "documentType": "resume | report | contract | other",
  "topics":       ["topic1", "topic2"]
}

DOCUMENT TEXT:
${text.slice(0, 12000)}
`.trim();
}

// ── Model cascade ────────────────────────────────────────────────────────
async function cascade(prompt: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

    let lastError: unknown;

    for (const model of GEMINI_MODELS) {
        try {
            console.log(`[Gemini Cascade] Trying model: ${model}`);
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 1024,
                    },
                }),
            });

            if (!res.ok) {
                const errText = await res.text();
                console.warn(`[Gemini Cascade][${model}] HTTP ${res.status}: ${errText}`);
                lastError = errText;
                continue;
            }

            const data: GeminiApiResponse = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

            if (!text) {
                lastError = 'Empty response from model';
                continue;
            }

            console.log(`[Gemini Cascade][${model}] ✅ Success`);
            return text;
        } catch (err) {
            lastError = err;
            console.warn(`[Gemini Cascade][${model}] threw:`, err);
        }
    }

    throw new Error(`All Gemini models failed. Last error: ${String(lastError)}`);
}

// ── Parse JSON safely ─────────────────────────────────────────────────────
function parseResponse(raw: string): GeminiDocumentResult {
    try {
        const cleaned = raw
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/```\s*$/i, '')
            .trim();

        const parsed = JSON.parse(cleaned);

        return {
            summary: parsed.summary ?? 'No summary available',
            keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
            documentType: parsed.documentType ?? 'other',
            topics: Array.isArray(parsed.topics) ? parsed.topics : [],
        };
    } catch {
        return {
            summary: raw.slice(0, 200),
            keyPoints: [],
            documentType: 'other',
            topics: [],
        };
    }
}
