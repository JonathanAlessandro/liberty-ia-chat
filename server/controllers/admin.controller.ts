import { getAiConfiguration, getDocumentById, listDocuments, updateAiConfiguration } from "../repositories/document.repository";
import { indexPdfDocument } from "../services/document-indexing.service";
import { registerPdfDocument, removePdfDocument } from "../services/document.service";

export async function listAdminDocuments() {
  return listDocuments();
}

export async function getAdminAiConfiguration() {
  return getAiConfiguration();
}

export async function saveAdminAiConfiguration(systemPrompt: string, userId: number) {
  const normalizedPrompt = systemPrompt.trim();
  return updateAiConfiguration(normalizedPrompt, userId);
}

export async function uploadAdminDocument(input: {
  fileName: string;
  mimeType: string;
  base64Content: string;
}, userId: number) {
  const { document, buffer } = await registerPdfDocument({ ...input, userId });
  await indexPdfDocument(document.id, buffer);
  return getDocumentAfterIndexing(document.id);
}

async function getDocumentAfterIndexing(documentId: number) {
  const document = await getDocumentById(documentId);
  if (!document) throw new Error("Documento não encontrado após a indexação.");
  return document;
}

export async function deleteAdminDocument(documentId: number) {
  await removePdfDocument(documentId);
  return { success: true as const };
}
