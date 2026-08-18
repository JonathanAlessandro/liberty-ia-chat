import { decodeAndValidatePdf, normalizePdfFileName } from "../middlewares/document-upload.middleware";
import { createDocument, getDocumentById, removeDocument } from "../repositories/document.repository";
import { removeDocumentPdf, storeDocumentPdf } from "./document-storage.service";

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
  const document = await getDocumentById(documentId);
  if (!document) throw new Error("Documento não encontrado.");

  await removeDocumentPdf(document.storageKey);
  await removeDocument(documentId);
}
