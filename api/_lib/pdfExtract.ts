export async function extractPdfText(buffer: Buffer): Promise<string> {
    try {
        const mod = await import("pdf-parse/lib/pdf-parse.js");
        const pdfParse = (mod as any).default ?? mod;
        const result = await pdfParse(buffer);
        return result.text ?? "";
    } catch (err) {
        console.error("[pdf-extract] failed:", err);
        throw new Error("PDF text extraction failed");
    }
}
