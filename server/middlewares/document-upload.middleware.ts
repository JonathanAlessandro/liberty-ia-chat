import { TRPCError } from "@trpc/server";
import path from "node:path";

export const MAX_PDF_SIZE_BYTES = 15 * 1024 * 1024;
export const MAX_SPREADSHEET_SIZE_BYTES = 8 * 1024 * 1024;
export type AdminUploadKind = "pdf" | "spreadsheet";

const spreadsheetExtensions = new Set([".xlsx", ".xls", ".csv"]);

export function decodeAndValidateAdminFile(base64Payload: string, fileName: string): { buffer: Buffer; kind: AdminUploadKind; mimeType: string } {
  const extension = path.extname(fileName.trim()).toLowerCase();
  const kind: AdminUploadKind | null = extension === ".pdf" ? "pdf" : spreadsheetExtensions.has(extension) ? "spreadsheet" : null;
  if (!kind) throw new TRPCError({ code: "BAD_REQUEST", message: "Envie arquivos PDF, XLSX, XLS ou CSV." });

  const buffer = Buffer.from(base64Payload.replace(/^data:[^;,]+;base64,/, ""), "base64");
  const limit = kind === "pdf" ? MAX_PDF_SIZE_BYTES : MAX_SPREADSHEET_SIZE_BYTES;
  if (buffer.length === 0 || buffer.length > limit) {
    throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: kind === "pdf" ? "O PDF deve ter entre 1 byte e 15 MB." : "A planilha deve ter entre 1 byte e 8 MB." });
  }
  if (kind === "pdf" && buffer.subarray(0, 4).toString("utf8") !== "%PDF") throw new TRPCError({ code: "BAD_REQUEST", message: "O conteúdo enviado não é um PDF válido." });
  if (extension === ".xlsx" && buffer.subarray(0, 2).toString("binary") !== "PK") throw new TRPCError({ code: "BAD_REQUEST", message: "O conteúdo enviado não é uma planilha XLSX válida." });
  if (extension === ".xls" && !buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) throw new TRPCError({ code: "BAD_REQUEST", message: "O conteúdo enviado não é uma planilha XLS válida." });
  if (extension === ".csv" && buffer.includes(0)) throw new TRPCError({ code: "BAD_REQUEST", message: "O conteúdo enviado não é um CSV de texto válido." });

  const mimeType = kind === "pdf" ? "application/pdf" : extension === ".csv" ? "text/csv" : extension === ".xls" ? "application/vnd.ms-excel" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return { buffer, kind, mimeType };
}

export function normalizeAdminFileName(fileName: string): string {
  const cleaned = fileName.trim().replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").replace(/\s+(\.[^.]+)$/, "$1");
  return cleaned.slice(0, 255) || "documento";
}

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
  const candidate = fileName.toLowerCase().endsWith(".pdf") ? fileName : `${fileName}.pdf`;
  return normalizeAdminFileName(candidate);
}
