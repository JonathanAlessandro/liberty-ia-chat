import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async () => [{ address: "1.1.1.1", family: 4 }]) }));
import { fetchPublicPage } from "./url-list-ingestion.service";
import { verifyResearchEvidence } from "./external-search.service";
const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => vi.unstubAllGlobals());
const page = () => new Response(`<title>ANS</title><p>${"Informação oficial confirmada. ".repeat(8)}</p>`, { headers: { "Content-Type": "text/html" } });
it("follows an official same-host HTTPS redirect and uses the actual page instead of the AI summary", async () => {
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "/ans/novo" } })).mockResolvedValueOnce(page());
  const evidence = await verifyResearchEvidence([{ type: "external", title: "Resumo", domain: "gov.br", url: "https://www.gov.br/ans/antigo", content: "Prazo inventado no resumo" }]);
  expect(evidence).toHaveLength(1);
  expect(evidence[0].url).toBe("https://www.gov.br/ans/novo");
  expect(evidence[0].content).toContain("Informação oficial confirmada.");
  expect(evidence[0].content).not.toContain("Prazo inventado");
});
it("refuses redirects outside the official host before requesting the new destination", async () => {
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://evil.example/ans" } }));
  await expect(fetchPublicPage("https://www.gov.br/ans/antigo", true)).rejects.toThrow("fora da fonte oficial");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("does not present an unavailable page's summary as verified evidence", async () => {
  fetchMock.mockRejectedValue(new Error("unavailable"));
  expect(await verifyResearchEvidence([{ type: "external", title: "ANS", domain: "gov.br", url: "https://www.gov.br/ans/regra", content: "Resumo da IA" }])).toEqual([]);
});
