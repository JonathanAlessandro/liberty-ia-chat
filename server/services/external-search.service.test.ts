import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

import { crawlExternalEvidence } from "./external-search.service";

describe("external crawl service", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    process.env.TAVILY_API_KEY = "tvly-test-key";
  });

  it("authenticates Tavily Crawl, limits traversal and keeps the key out of the request body", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ results: [{ url: "https://www.gov.br/ans/reembolso", raw_content: "<chunk 1> Conteúdo confiável." }] }), { status: 200 }));

    await expect(crawlExternalEvidence("cobertura de plano de saúde", ["https://www.gov.br/ans"])).resolves.toEqual([
      { type: "external", origin: "crawl", title: "reembolso", url: "https://www.gov.br/ans/reembolso", domain: "gov.br", content: "Conteúdo confiável." },
    ]);

    expect(fetchMock).toHaveBeenCalledWith("https://api.tavily.com/crawl", expect.objectContaining({
      headers: { "Content-Type": "application/json", Authorization: "Bearer tvly-test-key" },
    }));
    const requestBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body ?? "{}");
    expect(requestBody).toMatchObject({ url: "https://www.gov.br/ans", max_depth: 1, max_breadth: 8, limit: 4, chunks_per_source: 2, allow_external: false, extract_depth: "basic" });
    expect(requestBody).not.toHaveProperty("api_key");
  });
});
