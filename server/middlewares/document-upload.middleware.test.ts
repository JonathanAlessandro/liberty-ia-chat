import { describe, expect, it } from "vitest";
import { decodeAndValidatePdf, normalizePdfFileName } from "./document-upload.middleware";

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
  });
});
