import { afterEach, describe, expect, it, vi } from "vitest";
import { extractPdfPageVisually, needsVisualPdfExtraction, visualPdfExtractionEnabled, visualPdfPageLimit } from "./pdf-visual-extraction.service";

const originalEnv = { ...process.env };

describe("PDF visual extraction fallback", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("requests visual extraction for scanned or unresolved tabular pages", () => {
    expect(needsVisualPdfExtraction("", [])).toBe(true);
    expect(needsVisualPdfExtraction("Tabela\nPlano 15 16 17\nPsicoterapia 100,00 200,00 300,00\nConsulta 10,00 20,00 30,00", [])).toBe(true);
    expect(needsVisualPdfExtraction("Texto explicativo suficientemente longo sobre regras gerais de utilização, prazos e documentação necessária para reembolso.", [])).toBe(false);
    expect(needsVisualPdfExtraction("Tabela 15 16 17 18 19 20 21 22\nLinha 1 2 3", ["Linha estruturada"])).toBe(false);
  });

  it("supports operational limits and disabling the fallback", () => {
    process.env.PDF_VISION_MAX_PAGES = "7";
    process.env.PDF_VISION_ENABLED = "false";
    expect(visualPdfPageLimit()).toBe(7);
    expect(visualPdfExtractionEnabled()).toBe(false);
  });

  it("returns structured visual text from the configured vision model", async () => {
    process.env.LLM_BASE_URL = "https://api.openai.com/v1";
    process.env.LLM_API_KEY = "test-key";
    process.env.PDF_VISION_MODEL = "gpt-4.1-mini";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ text: "Linha: Psicoterapia\nColuna 16: 194,53" }) } }] }) });
    vi.stubGlobal("fetch", fetchMock);
    await expect(extractPdfPageVisually("data:image/png;base64,abc", 1)).resolves.toContain("Coluna 16: 194,53");
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).messages[1].content[1].image_url.detail).toBe("high");
  });
});
