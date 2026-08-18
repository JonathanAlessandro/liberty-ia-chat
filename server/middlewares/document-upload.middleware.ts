import { TRPCError } from "@trpc/server";

export const MAX_PDF_SIZE_BYTES = 15 * 1024 * 1024;

export function decodeAndValidatePdf(base64Payload: string, declaredMimeType: string): Buffer {
  if (declaredMimeType !== "application/pdf") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Envie apenas arquivos no formato PDF." });
  }

  const normalized = base64Payload.replace(/^data:application\/pdf;base64,/, "");
  const buffer = Buffer.from(normalized, "base64");

  if (buffer.length === 0 || buffer.length > MAX_PDF_SIZE_BYTES) {
    throw new TRPCError({
      code: "PAYLOAD_TOO_LARGE",
      message: "O PDF deve ter entre 1 byte e 15 MB.",
    });
  }

  if (buffer.subarray(0, 4).toString("utf8") !== "%PDF") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "O conteúdo enviado não é um PDF válido." });
  }

  return buffer;
}

export function normalizePdfFileName(fileName: string): string {
  const cleaned = fileName.trim().replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ");
  const name = cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
  return name.slice(0, 255) || "documento.pdf";
}
