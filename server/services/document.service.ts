import { decodeAndValidateAdminFile, normalizeAdminFileName } from "../middlewares/document-upload.middleware";
import { createDocument, removeDocument } from "../repositories/document.repository";
import { storeAdminDocument } from "./document-storage.service";
import { getKnowledgeFolder } from "../repositories/knowledge-folder.repository";
import { parseKnowledgeBundle } from "./knowledge-bundle";

export async function registerAdminDocument(input: {
  fileName: string;
  mimeType: string;
  base64Content: string;
  folderId?: number;
  userId: number;
}) {
  const folder = input.folderId ? await getKnowledgeFolder(input.folderId) : null;
  if (input.folderId && !folder) throw new Error("A pasta selecionada não existe mais.");
  const validated = decodeAndValidateAdminFile(input.base64Content, input.fileName);
  const originalName = normalizeAdminFileName(input.fileName);
  const bundle = validated.kind === "knowledge" ? parseKnowledgeBundle(validated.buffer) : null;
  if (bundle && folder && folder.name.toLocaleLowerCase("pt-BR") !== bundle.sourceGroup.toLocaleLowerCase("pt-BR")) throw new Error("A operadora da base consolidada deve corresponder à pasta selecionada.");
  const stored = await storeAdminDocument(originalName, validated.buffer, validated.mimeType);
  const document = await createDocument({
    originalName,
    storageKey: stored.key,
    sizeBytes: validated.buffer.length,
    mimeType: validated.mimeType,
    sourceKind: validated.kind,
    folderId: folder?.id ?? null,
    sourceGroup: folder?.name ?? bundle?.sourceGroup ?? null,
    createdByUserId: input.userId,
  });

  return { document, buffer: validated.buffer, kind: validated.kind };
}

export async function removeAdminDocument(documentId: number) {
  await removeDocument(documentId);
}

export const registerPdfDocument = registerAdminDocument;
export const removePdfDocument = removeAdminDocument;
