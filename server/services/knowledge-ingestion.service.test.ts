import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { effectiveDateFromPath, isSupportedKnowledgeFile, sourceGroupFromPath, spreadsheetSections } from "./knowledge-ingestion.service";

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

  it("indexes spreadsheet rows with their column labels for clearer interpretation", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["prestador", "cidade", "especialidade"],
      ["Clínica Central", "São Paulo", "Cardiologia"],
    ]), "Rede");
    const sections = spreadsheetSections(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));

    expect(sections[1]).toMatchObject({ ordinal: 1, label: 2 });
    expect(sections[1]?.text).toContain("A [prestador]: Clínica Central");
    expect(sections[1]?.text).toContain("B [cidade]: São Paulo");
    expect(sections[1]?.text).toContain("C [especialidade]: Cardiologia");
  });

  it("combines multi-level product headers before indexing reimbursement rows", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["", "", "IMPORTANTE: valor meramente ilustrativo e sujeito às condições contratuais aplicáveis ao segurado."],
      ["", "SPG", "Saúde +", "", "Nacional Plus", ""],
      ["", "PROCEDIMENTOS", "TENM", "TQNM", "TPN4", "TPN6"],
      ["", "", "", "", "", ""],
      [50000470, "Sessão de psicoterapia", 62.183, 62.183, 248.732, 310.915],
    ]), "SPG");

    const sections = spreadsheetSections(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));

    const reimbursementRow = sections.find(section => section.label === 5);
    expect(reimbursementRow?.text).toContain("E [Nacional Plus / TPN4]: 248.732");
    expect(reimbursementRow?.text).toContain("B [SPG / PROCEDIMENTOS]: Sessão de psicoterapia");
    expect(reimbursementRow?.text).toContain("Cabeçalhos próximos:");
  });

  it("keeps numeric plan codes and does not turn the first data row into a header", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["", "PLANOS OMINT - EMPRESARIAL", "PLANOS OMINT - EMPRESARIAL", "PLANOS SKILL"],
      ["Despesas Ambulatoriais:", "15", "16", "SC1"],
      ["Consulta Consultório", 356.35, 438.40, 250.46],
      ["Psicoterapia por Sessão", 146.23, 194.53, 83.14],
    ]), "Reembolso");

    const sections = spreadsheetSections(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
    const psychotherapy = sections.find(section => section.label === 4);
    expect(psychotherapy?.text).toContain("B [PLANOS OMINT - EMPRESARIAL / 15]: 146.23");
    expect(psychotherapy?.text).toContain("C [PLANOS OMINT - EMPRESARIAL / 16]: 194.53");
    expect(psychotherapy?.text).not.toContain("Consulta Consultório");
  });

  it("keeps coordinate-based content when a sheet has no conventional table header", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Resumo executivo"],
      ["Plano escolhido", "Premium"],
      ["Reembolso", 450],
    ]), "Ficha livre");

    const sections = spreadsheetSections(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));

    expect(sections.find(section => section.label === 3)?.text).toContain("A [Plano escolhido]: Reembolso");
    expect(sections.find(section => section.label === 3)?.text).toContain("B [Premium]: 450");
  });
});
