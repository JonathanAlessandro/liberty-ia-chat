import { decodeAndValidateAdminFile, normalizeAdminFileName } from "../middlewares/document-upload.middleware";
import { createDocument, removeDocument } from "../repositories/document.repository";
import { storeAdminDocument } from "./document-storage.service";

export async function registerAdminDocument(input: {
  fileName: string;
  mimeType: string;
  base64Content: string;
  userId: number;
}) {
  const validated = decodeAndValidateAdminFile(input.base64Content, input.fileName);
  const originalName = normalizeAdminFileName(input.fileName);
  const stored = await storeAdminDocument(originalName, validated.buffer, validated.mimeType);
  const document = await createDocument({
    originalName,
    storageKey: stored.key,
    sizeBytes: validated.buffer.length,
    mimeType: validated.mimeType,
    sourceKind: validated.kind,
    createdByUserId: input.userId,
  });

  return { document, buffer: validated.buffer, kind: validated.kind };
}

export async function removeAdminDocument(documentId: number) {
  await removeDocument(documentId);
}

export const registerPdfDocument = registerAdminDocument;
export const removePdfDocument = removeAdminDocument;
