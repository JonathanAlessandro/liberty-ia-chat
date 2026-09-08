import { failDocumentIndexing, getAiConfiguration, getDocumentById, listDocuments, markDocumentProcessing, moveDocumentToFolder, updateAiConfiguration } from "../repositories/document.repository";
import { indexExtractedTextDocument, indexPdfDocument } from "../services/document-indexing.service";
import { registerAdminDocument, removeAdminDocument } from "../services/document.service";
import { spreadsheetSections } from "../services/knowledge-ingestion.service";
import { createKnowledgeFolder, getKnowledgeFolder, listKnowledgeFolders, renameKnowledgeFolder } from "../repositories/knowledge-folder.repository";
import { TRPCError } from "@trpc/server";
import { readKnowledgeAsset } from "../services/document-storage.service";

export async function listAdminDocuments() {
  return listDocuments();
}

export async function uploadAdminDocument(input: {
  fileName: string;
  mimeType: string;
  base64Content: string;
  folderId?: number;
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

export async function reindexAdminDocuments() {
  const documents = await listDocuments();
  let processed = 0;
  let failed = 0;
  let skipped = 0;
  for (const document of documents) {
    if (document.sourceKind !== "pdf" && document.sourceKind !== "spreadsheet") {
      skipped++;
      continue;
    }
    try {
      await markDocumentProcessing(document.id);
      const buffer = await readKnowledgeAsset(document.storageKey);
      if (document.sourceKind === "pdf") await indexPdfDocument(document.id, buffer);
      else await indexExtractedTextDocument(document.id, spreadsheetSections(buffer));
      processed++;
    } catch (error) {
      failed++;
      await failDocumentIndexing(document.id, error instanceof Error ? error.message : "Falha ao reindexar o documento.");
    }
  }
  return { processed, failed, skipped };
}

export async function listAdminKnowledgeFolders() {
  return listKnowledgeFolders();
}

export async function createAdminKnowledgeFolder(name: string, userId: number) {
  const normalized = name.trim().replace(/\s+/g, " ");
  const existing = await listKnowledgeFolders();
  if (existing.some(folder => folder.name.toLocaleLowerCase("pt-BR") === normalized.toLocaleLowerCase("pt-BR"))) throw new TRPCError({ code: "CONFLICT", message: "Já existe uma pasta com esse nome." });
  return createKnowledgeFolder(normalized, userId);
}

export async function renameAdminKnowledgeFolder(folderId: number, name: string) {
  const normalized = name.trim().replace(/\s+/g, " ");
  const folders = await listKnowledgeFolders();
  if (!folders.some(folder => folder.id === folderId)) throw new TRPCError({ code: "NOT_FOUND", message: "A pasta não existe mais." });
  if (folders.some(folder => folder.id !== folderId && folder.name.toLocaleLowerCase("pt-BR") === normalized.toLocaleLowerCase("pt-BR"))) throw new TRPCError({ code: "CONFLICT", message: "Já existe uma pasta com esse nome." });
  return renameKnowledgeFolder(folderId, normalized);
}

export async function moveAdminDocument(documentId: number, folderId?: number) {
  const folder = folderId ? await getKnowledgeFolder(folderId) : null;
  if (folderId && !folder) throw new Error("A pasta selecionada não existe mais.");
  return moveDocumentToFolder(documentId, folder);
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
