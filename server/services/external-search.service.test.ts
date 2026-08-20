import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

import { searchExternalEvidence } from "./external-search.service";

describe("external search service", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    process.env.TAVILY_API_KEY = "tvly-test-key";
  });

  it("authenticates Tavily Search with a Bearer header and keeps the key out of the request body", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ results: [{ title: "Fonte oficial", url: "https://www.gov.br/ans", content: "Conteúdo confiável.", score: 0.9 }] }), { status: 200 }));

    await expect(searchExternalEvidence("cobertura de plano de saúde")).resolves.toEqual([
      { type: "external", origin: "search", title: "Fonte oficial", url: "https://www.gov.br/ans", domain: "gov.br", content: "Conteúdo confiável." },
    ]);

    expect(fetchMock).toHaveBeenCalledWith("https://api.tavily.com/search", expect.objectContaining({
      headers: { "Content-Type": "application/json", Authorization: "Bearer tvly-test-key" },
    }));
    const requestBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body ?? "{}");
    expect(requestBody).toMatchObject({ max_results: 5, search_depth: "advanced" });
    expect(requestBody).not.toHaveProperty("api_key");
  });
});
