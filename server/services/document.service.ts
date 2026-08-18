import { decodeAndValidatePdf, normalizePdfFileName } from "../middlewares/document-upload.middleware";
import { createDocument, removeDocument } from "../repositories/document.repository";
import { storeDocumentPdf } from "./document-storage.service";

export async function registerPdfDocument(input: {
  fileName: string;
  mimeType: string;
  base64Content: string;
  userId: number;
}) {
  const buffer = decodeAndValidatePdf(input.base64Content, input.mimeType);
  const originalName = normalizePdfFileName(input.fileName);
  const stored = await storeDocumentPdf(originalName, buffer);
  const document = await createDocument({
    originalName,
    storageKey: stored.key,
    sizeBytes: buffer.length,
    createdByUserId: input.userId,
  });

  return { document, buffer };
}

export async function removePdfDocument(documentId: number) {
  await removeDocument(documentId);
}
