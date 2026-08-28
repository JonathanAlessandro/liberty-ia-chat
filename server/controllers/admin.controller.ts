import { getAiConfiguration, getDocumentById, listDocuments, updateAiConfiguration } from "../repositories/document.repository";
import { indexExtractedTextDocument, indexPdfDocument } from "../services/document-indexing.service";
import { registerAdminDocument, removeAdminDocument } from "../services/document.service";
import { spreadsheetSections } from "../services/knowledge-ingestion.service";

export async function listAdminDocuments() {
  return listDocuments();
}

export async function uploadAdminDocument(input: {
  fileName: string;
  mimeType: string;
  base64Content: string;
  userId: number;
}) {
  const { document, buffer, kind } = await registerAdminDocument(input);
  try {
    if (kind === "pdf") await indexPdfDocument(document.id, buffer);
    else await indexExtractedTextDocument(document.id, spreadsheetSections(buffer));
  } catch {
    // O erro detalhado fica persistido no documento para o painel administrativo.
  }
  return getDocumentById(document.id);
}

export async function deleteAdminDocument(documentId: number) {
  await removeAdminDocument(documentId);
  return { success: true } as const;
}

export async function getAdminAiConfiguration() {
  return getAiConfiguration();
}

export async function saveAdminAiConfiguration(systemPrompt: string, userId: number) {
  return updateAiConfiguration(systemPrompt.trim(), userId);
}
