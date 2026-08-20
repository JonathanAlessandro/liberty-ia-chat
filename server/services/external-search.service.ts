import type { ExternalSourceReference } from "../models/liberty-ai.models";

type TavilyResult = {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
};

export type ExternalEvidence = ExternalSourceReference & { content: string };

function normalizeResult(result: TavilyResult): ExternalEvidence | null {
  if (!result.url || !result.content) return null;
  try {
    const parsed = new URL(result.url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return {
      type: "external",
      origin: "search",
      title: (result.title?.trim() || parsed.hostname).slice(0, 180),
      url: parsed.toString(),
      domain: parsed.hostname.replace(/^www\./, ""),
      content: result.content.replace(/\s+/g, " ").trim().slice(0, 2200),
    };
  } catch {
    return null;
  }
}

export async function searchExternalEvidence(query: string): Promise<ExternalEvidence[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      query,
      max_results: 3,
      search_depth: "basic",
      include_answer: false,
      include_raw_content: false,
    }),
  });

  if (!response.ok) {
    console.warn(`[External search] Search unavailable: ${response.status}`);
    return [];
  }

  const payload = await response.json() as { results?: TavilyResult[] };
  return (payload.results ?? [])
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .map(normalizeResult)
    .filter((result): result is ExternalEvidence => Boolean(result));
}
