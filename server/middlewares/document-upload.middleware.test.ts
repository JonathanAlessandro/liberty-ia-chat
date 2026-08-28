import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { decodeAndValidateAdminFile, decodeAndValidatePdf, normalizeAdminFileName, normalizePdfFileName } from "./document-upload.middleware";

describe("document upload validation", () => {
  it("accepts a bounded PDF payload with a valid signature", () => {
    const payload = Buffer.from("%PDF-1.7 conteúdo de teste").toString("base64");
    const buffer = decodeAndValidatePdf(payload, "application/pdf");
    expect(buffer.toString("utf8")).toContain("%PDF-1.7");
  });

  it("rejects an invalid file signature even when the MIME type says PDF", () => {
    const payload = Buffer.from("este conteúdo não é um pdf").toString("base64");
    expect(() => decodeAndValidatePdf(payload, "application/pdf")).toThrow("não é um PDF válido");
  });

  it("normalizes names to avoid unsafe path characters", () => {
    expect(normalizePdfFileName(" guia: contratual / 2026 ")).toBe("guia- contratual - 2026.pdf");
    expect(normalizeAdminFileName(" preços: 2026.xlsx ")).toBe("preços- 2026.xlsx");
  });

  it("accepts XLSX and CSV spreadsheets", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Plano", "Valor"], ["A", 100]]), "Tabela");
    const xlsx = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    expect(decodeAndValidateAdminFile(xlsx.toString("base64"), "tabela.xlsx")).toMatchObject({ kind: "spreadsheet", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    expect(decodeAndValidateAdminFile(Buffer.from("plano,valor\nA,100").toString("base64"), "tabela.csv")).toMatchObject({ kind: "spreadsheet", mimeType: "text/csv" });
  });

  it("rejects unsupported extensions and fake spreadsheets", () => {
    expect(() => decodeAndValidateAdminFile(Buffer.from("texto").toString("base64"), "notas.txt")).toThrow("PDF, XLSX, XLS ou CSV");
    expect(() => decodeAndValidateAdminFile(Buffer.from("não é zip").toString("base64"), "tabela.xlsx")).toThrow("não é uma planilha XLSX válida");
  });
});
