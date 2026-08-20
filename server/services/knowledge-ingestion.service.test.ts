import { describe, expect, it } from "vitest";
import { effectiveDateFromPath, isSupportedKnowledgeFile, sourceGroupFromPath } from "./knowledge-ingestion.service";

describe("knowledge folder file selection", () => {
  it("accepts the supported PDF, image and spreadsheet formats", () => {
    expect(isSupportedKnowledgeFile("/acervo/manual.pdf")).toBe(true);
    expect(isSupportedKnowledgeFile("/acervo/foto.jpeg")).toBe(true);
    expect(isSupportedKnowledgeFile("/acervo/tabela.xlsx")).toBe(true);
    expect(isSupportedKnowledgeFile("/acervo/dados.csv")).toBe(true);
    expect(isSupportedKnowledgeFile("/acervo/fontes.txt")).toBe(true);
  });

  it("ignores files outside the supported knowledge formats", () => {
    expect(isSupportedKnowledgeFile("/acervo/video.mp4")).toBe(false);
    expect(isSupportedKnowledgeFile("/acervo/anotacao.docx")).toBe(false);
    expect(isSupportedKnowledgeFile("/acervo/anotacoes.txt")).toBe(false);
  });

  it("derives the operator group and validity date from the monitored folder path", () => {
    expect(sourceGroupFromPath("amil/2026-01-15--amil--carencias.pdf")).toBe("amil");
    expect(effectiveDateFromPath("amil/2026-01-15--amil--carencias.pdf")?.toISOString()).toBe("2026-01-15T00:00:00.000Z");
  });

  it("does not invent a validity date when a filename has no valid calendar date", () => {
    expect(effectiveDateFromPath("amil/2026-02-30--amil--carencias.pdf")).toBeNull();
  });
});
