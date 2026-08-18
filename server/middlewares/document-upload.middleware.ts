const MAX_PDF_BYTES = 15 * 1024 * 1024;
const PDF_SIGNATURE = "%PDF-";

function invalidPdfError() {
  return new Error("O arquivo informado não é um PDF válido.");
}

export function decodeAndValidatePdf(base64Content: string, mimeType: string): Buffer {
  if (mimeType !== "application/pdf" || typeof base64Content !== "string") {
    throw invalidPdfError();
  }

  const payload = base64Content.replace(/^data:application\/pdf;base64,/i, "").replace(/\s+/g, "");
  if (!payload || !/^[A-Za-z0-9+/]*={0,2}$/.test(payload) || payload.length % 4 === 1) {
    throw invalidPdfError();
  }

  const buffer = Buffer.from(payload, "base64");
  if (buffer.length === 0 || buffer.length > MAX_PDF_BYTES) {
    throw new Error("O PDF deve ter no máximo 15 MB.");
  }

  if (buffer.subarray(0, PDF_SIGNATURE.length).toString("ascii") !== PDF_SIGNATURE) {
    throw invalidPdfError();
  }

  return buffer;
}

export function normalizePdfFileName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.pdf$/i, "").trim();
  const normalized = withoutExtension
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]/g, " - ")
    .replace(/[:*?"<>|]/g, "-")
    .replace(/\s{2,}/g, " ")
    .trim();

  const safeName = normalized || "documento";
  return `${safeName.slice(0, 251)}.pdf`;
}

export { MAX_PDF_BYTES };
