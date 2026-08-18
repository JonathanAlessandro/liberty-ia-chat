import { describe, expect, it } from "vitest";
import { isSupportedKnowledgeFile } from "./knowledge-ingestion.service";

describe("knowledge folder file selection", () => {
  it("accepts the supported PDF, image and spreadsheet formats", () => {
    expect(isSupportedKnowledgeFile("/acervo/manual.pdf")).toBe(true);
    expect(isSupportedKnowledgeFile("/acervo/foto.jpeg")).toBe(true);
    expect(isSupportedKnowledgeFile("/acervo/tabela.xlsx")).toBe(true);
    expect(isSupportedKnowledgeFile("/acervo/dados.csv")).toBe(true);
  });

  it("ignores files outside the supported knowledge formats", () => {
    expect(isSupportedKnowledgeFile("/acervo/video.mp4")).toBe(false);
    expect(isSupportedKnowledgeFile("/acervo/anotacao.docx")).toBe(false);
  });
});
