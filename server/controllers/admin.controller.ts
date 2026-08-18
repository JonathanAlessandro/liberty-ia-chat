import { getAiConfiguration, getDocumentById, listDocuments, updateAiConfiguration } from "../repositories/document.repository";
import { indexPdfDocument } from "../services/document-indexing.service";
import { registerPdfDocument, removePdfDocument } from "../services/document.service";

export async function listAdminDocuments() {
  return listDocuments();
}

export async function uploadAdminDocument(input: {
  fileName: string;
  mimeType: string;
  base64Content: string;
  userId: number;
}) {
  const { document, buffer } = await registerPdfDocument(input);
  try {
    await indexPdfDocument(document.id, buffer);
  } catch {
    // O erro detalhado fica persistido no documento para o painel administrativo.
  }
  return getDocumentById(document.id);
}

export async function deleteAdminDocument(documentId: number) {
  await removePdfDocument(documentId);
  return { success: true } as const;
}

export async function getAdminAiConfiguration() {
  return getAiConfiguration();
}

export async function saveAdminAiConfiguration(systemPrompt: string, userId: number) {
  return updateAiConfiguration(systemPrompt.trim(), userId);
}
