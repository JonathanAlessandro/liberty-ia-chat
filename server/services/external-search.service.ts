import type { ExternalSourceReference } from "../models/liberty-ai.models";

type TavilyCrawlResult = {
  url?: string;
  raw_content?: string;
};

export type ExternalEvidence = ExternalSourceReference & { content: string };

function normalizeResult(result: TavilyCrawlResult): ExternalEvidence | null {
  if (!result.url || !result.raw_content) return null;
  try {
    const parsed = new URL(result.url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    const pageLabel = decodeURIComponent(parsed.pathname).split("/").filter(Boolean).at(-1)?.replace(/[-_]+/g, " ") || parsed.hostname;
    return {
      type: "external",
      origin: "crawl",
      title: pageLabel.slice(0, 180),
      url: parsed.toString(),
      domain: parsed.hostname.replace(/^www\./, ""),
      content: result.raw_content.replace(/<chunk \d+>/gi, " ").replace(/\s+/g, " ").trim().slice(0, 2400),
    };
  } catch {
    return null;
  }
}

function domainPattern(hostname: string) {
  return `^${hostname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
}

export async function crawlExternalEvidence(query: string, rootUrls: string[]): Promise<ExternalEvidence[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  const rootUrl = rootUrls[0];
  if (!apiKey || !rootUrl) return [];

  let parsedRoot: URL;
  try {
    parsedRoot = new URL(rootUrl);
    if (parsedRoot.protocol !== "https:" && parsedRoot.protocol !== "http:") return [];
  } catch {
    return [];
  }

  let response: Response;
  try {
    response = await fetch("https://api.tavily.com/crawl", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(14_000),
      body: JSON.stringify({
        url: parsedRoot.toString(),
        instructions: `Encontre conteúdo oficial diretamente relacionado a esta pergunta: ${query.slice(0, 500)}`,
        chunks_per_source: 2,
        max_depth: 1,
        max_breadth: 8,
        limit: 4,
        select_domains: [domainPattern(parsedRoot.hostname)],
        allow_external: false,
        extract_depth: "basic",
        format: "markdown",
        include_images: false,
        timeout: 12,
      }),
    });
  } catch (error) {
    console.warn("[External crawl] Crawl unavailable:", error instanceof Error ? error.message : error);
    return [];
  }

  if (!response.ok) {
    console.warn(`[External crawl] Crawl unavailable: ${response.status}`);
    return [];
  }

  const payload = await response.json() as { results?: TavilyCrawlResult[] };
  return (payload.results ?? [])
    .map(normalizeResult)
    .filter((result): result is ExternalEvidence => Boolean(result));
}
