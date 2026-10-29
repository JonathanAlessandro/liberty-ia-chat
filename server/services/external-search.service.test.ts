import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crawlExternalEvidence } from "./external-search.service";
const fetchMock = vi.fn();
const originalEnv = { ...process.env };
const result = (url = "https://www.gov.br/ans/regra") => ({ status: "completed", output: [
  { type: "web_search_call" },
  { type: "message", content: [{ type: "output_text", text: "Regra geral da ANS, atualizada em 2026.", annotations: [{ type: "url_citation", title: "ANS", url }] }] },
] });
describe("AI API web research", () => {
  beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); process.env.LLM_API_KEY = "test-key"; process.env.LLM_BASE_URL = "https://api.openai.com/v1"; delete process.env.LLM_WEB_SEARCH_ENABLED; });
  afterEach(() => { process.env = { ...originalEnv }; vi.unstubAllGlobals(); });
  it("requires live research, limits official domains and disables provider storage", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(result())));
    const evidence = await crawlExternalEvidence("Qual é a regra da ANS?", ["https://www.amil.com.br/regras"]);
    expect(evidence).toEqual([expect.objectContaining({ origin: "ai-search", url: "https://www.gov.br/ans/regra", content: expect.stringContaining("2026") })]);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe("gpt-5-mini");
    expect(body.reasoning).toEqual({ effort: "low" });
    expect(body).toMatchObject({ store: false, tool_choice: "required", tools: [{ type: "web_search", filters: { allowed_domains: ["www.gov.br", "www.amil.com.br"] } }] });
    expect(body).not.toHaveProperty("api_key");
    expect(body.input).toBe("Qual é a regra da ANS?");
  });
  it.each(["https://blog.example/regra", "https://www.gov.br/outro/regra", "javascript:alert(1)", "https://www.gov.br.evil.test/ans/regra"])("rejects untrusted citation %s", async url => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(result(url))));
    expect(await crawlExternalEvidence("regra", [])).toEqual([]);
  });
  it("rejects uncited and incomplete research", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: "incomplete", output: result().output })));
    expect(await crawlExternalEvidence("regra", [])).toEqual([]);
    const uncited = result(); uncited.output[1].content![0].annotations = [];
    fetchMock.mockResolvedValue(new Response(JSON.stringify(uncited)));
    expect(await crawlExternalEvidence("regra", [])).toEqual([]);
  });
  it("degrades without losing internal answers on provider errors or timeout", async () => {
    fetchMock.mockResolvedValue(new Response("unavailable", { status: 503 }));
    expect(await crawlExternalEvidence("regra", [])).toEqual([]);
    fetchMock.mockRejectedValue(new DOMException("timeout", "TimeoutError"));
    expect(await crawlExternalEvidence("regra", [])).toEqual([]);
  });
  it("can disable external requests", async () => {
    process.env.LLM_WEB_SEARCH_ENABLED = "false";
    expect(await crawlExternalEvidence("regra", [])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("keeps the cited ANS passage without attributing a later unapproved passage to it", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: "completed", output: [
      { type: "web_search_call" },
      { type: "message", content: [{ type: "output_text", text: "Regra ANS. [1] Outra regra do blog. [2]", annotations: [
        { type: "url_citation", title: "ANS", url: "https://www.gov.br/ans/regra", start_index: 11, end_index: 14 },
        { type: "url_citation", title: "Blog", url: "https://blog.example/regra", start_index: 35, end_index: 38 },
      ] }] },
    ] })));
    const evidence = await crawlExternalEvidence("regra", []);
    expect(evidence).toHaveLength(1);
    expect(evidence[0].content).toContain("Regra ANS.");
    expect(evidence[0].content).not.toContain("Outra regra do blog");
  });
});
