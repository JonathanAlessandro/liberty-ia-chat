const MIN_TEXT_LENGTH = 80;
const DEFAULT_MAX_VISUAL_PAGES = 20;

export function needsVisualPdfExtraction(text: string, structuredRows: string[]) {
  const normalized = text.trim();
  if (structuredRows.length > 0) return false;
  if (normalized.length < MIN_TEXT_LENGTH) return true;
  const numericTokens = normalized.match(/\b\d[\d.,/%-]*\b/g)?.length ?? 0;
  const linesWithSeveralValues = normalized.split(/\r?\n/).filter(line => (line.match(/\b\d[\d.,/%-]*\b/g)?.length ?? 0) >= 3).length;
  return numericTokens >= 8 && linesWithSeveralValues >= 2;
}

export function visualPdfPageLimit() {
  const configured = Number(process.env.PDF_VISION_MAX_PAGES);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_MAX_VISUAL_PAGES;
}

export function visualPdfExtractionEnabled() {
  const configured = process.env.PDF_VISION_ENABLED?.trim().toLowerCase();
  return configured !== "false" && configured !== "0";
}

export async function extractPdfPageVisually(imageDataUrl: string, pageNumber: number) {
  const baseUrl = process.env.LLM_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.LLM_API_KEY;
  if (!baseUrl || !apiKey) return null;
  const model = process.env.PDF_VISION_MODEL?.trim() || "gpt-4.1-mini";
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({
        model,
        temperature: 0,
        max_completion_tokens: 4000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Extraia fielmente documentos em português. Nunca complete, calcule ou invente conteúdo ilegível." },
          { role: "user", content: [
            { type: "text", text: `Transcreva a página ${pageNumber}. Preserve títulos, vigência, notas e relações de tabelas. Para cada linha de tabela, escreva: Linha: <rótulo>, seguido por uma linha 'Coluna <cabeçalho>: <valor>' para cada célula. Responda somente JSON no formato {\"text\":\"...\"}.` },
            { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
          ] },
        ],
      }),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as { text?: unknown };
    return typeof parsed.text === "string" && parsed.text.trim().length >= 20 ? parsed.text.trim() : null;
  } catch (error) {
    console.warn(`[PDF visual] Página ${pageNumber} não pôde ser lida visualmente:`, error instanceof Error ? error.message : error);
    return null;
  }
}
