import { and, desc, eq, like } from "drizzle-orm";
import { aiConfigurations, documentChunks, documents } from "../../drizzle/schema";
import type { IndexedChunk } from "../models/liberty-ai.models";
import { getDb } from "../db";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

export async function listDocuments() {
  const db = await requireDb();
  return db.select().from(documents).orderBy(desc(documents.createdAt));
}

export async function getDocumentById(documentId: number) {
  const db = await requireDb();
  const result = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  return result[0] ?? null;
}

export async function getDocumentBySourcePath(sourcePath: string) {
  const db = await requireDb();
  const result = await db.select().from(documents).where(eq(documents.sourcePath, sourcePath)).limit(1);
  return result[0] ?? null;
}

export async function listDocumentsBySourcePathPrefix(prefix: string) {
  const db = await requireDb();
  return db.select().from(documents).where(and(like(documents.sourcePath, `${prefix}%`), eq(documents.sourceKind, "web")));
}

export async function createDocument(input: { originalName: string; storageKey: string; sizeBytes: number; createdByUserId: number }) {
  const db = await requireDb();
  const inserted = await db.insert(documents).values({ ...input, mimeType: "application/pdf", sourceKind: "pdf", sourceOrigin: "upload", status: "processing" });
  const id = Number(inserted[0].insertId);
  const document = await getDocumentById(id);
  if (!document) throw new Error("Não foi possível criar o registro do documento.");
  return document;
}

export async function prepareFolderDocument(input: {
  existingDocumentId?: number;
  originalName: string;
  storageKey: string;
  mimeType: string;
  sourceKind: string;
  sourceAuthority: "internal_training" | "official_registered";
  sourceGroup?: string | null;
  effectiveAt?: Date | null;
  sourcePath: string;
  sourceFingerprint: string;
  sizeBytes: number;
}) {
  const db = await requireDb();
  const values = { ...input, sourceOrigin: "folder" as const, status: "processing" as const, pageCount: null, extractedAt: null, errorMessage: null, createdByUserId: null };
  if (input.existingDocumentId) {
    await db.update(documents).set(values).where(eq(documents.id, input.existingDocumentId));
    const updated = await getDocumentById(input.existingDocumentId);
    if (!updated) throw new Error("Não foi possível atualizar o arquivo da pasta de conhecimento.");
    return updated;
  }
  const inserted = await db.insert(documents).values(values);
  const created = await getDocumentById(Number(inserted[0].insertId));
  if (!created) throw new Error("Não foi possível registrar o arquivo da pasta de conhecimento.");
  return created;
}

export async function completeDocumentIndexing(documentId: number, pageCount: number, chunks: IndexedChunk[]) {
  const db = await requireDb();
  await db.transaction(async tx => {
    await tx.delete(documentChunks).where(eq(documentChunks.documentId, documentId));
    if (chunks.length) await tx.insert(documentChunks).values(chunks.map(chunk => ({ documentId, content: chunk.content, pageStart: chunk.pageStart, pageEnd: chunk.pageEnd, ordinal: chunk.ordinal })));
    await tx.update(documents).set({ status: "ready", pageCount, extractedAt: new Date(), errorMessage: null }).where(eq(documents.id, documentId));
  });
}

export async function failDocumentIndexing(documentId: number, errorMessage: string) {
  const db = await requireDb();
  await db.update(documents).set({ status: "failed", errorMessage: errorMessage.slice(0, 1000) }).where(eq(documents.id, documentId));
}

export async function removeDocument(documentId: number) {
  const db = await requireDb();
  await db.delete(documents).where(eq(documents.id, documentId));
}

export async function getReadyChunksWithDocuments() {
  const db = await requireDb();
  return db.select({ chunkId: documentChunks.id, content: documentChunks.content, pageStart: documentChunks.pageStart, pageEnd: documentChunks.pageEnd, documentId: documents.id, documentName: documents.originalName, sourceKind: documents.sourceKind, sourceAuthority: documents.sourceAuthority, sourceGroup: documents.sourceGroup, effectiveAt: documents.effectiveAt, storageKey: documents.storageKey }).from(documentChunks).innerJoin(documents, eq(documentChunks.documentId, documents.id)).where(eq(documents.status, "ready"));
}

const DEFAULT_SYSTEM_PROMPT = `Você é a LibertyAI. Responda em português do Brasil, de forma clara, acolhedora e objetiva. Use documentos internos de treinamento como fonte relevante e páginas oficiais previamente cadastradas como referência complementar. Quando uma página oficial cadastrada trouxer vigência, versão ou atualização comprovadamente posterior a um documento interno conflitante, informe o critério e priorize a fonte mais recente. Se não for possível comparar vigência, explique o conflito e oriente confirmação com a operadora. Se não houver documentos nem fontes externas disponíveis, ofereça orientação geral útil, mas deixe explícito que ela não foi baseada no acervo da LibertyAI. Não atribua regras, prazos, preços ou procedimentos à LibertyAI sem fontes. Quando for útil, cite as fontes documentais e externas informadas no contexto.`;

export async function getAiConfiguration() {
  const db = await requireDb();
  const existing = await db.select().from(aiConfigurations).orderBy(desc(aiConfigurations.updatedAt)).limit(1);
  if (existing[0]) return existing[0];
  const inserted = await db.insert(aiConfigurations).values({ systemPrompt: DEFAULT_SYSTEM_PROMPT });
  const created = await db.select().from(aiConfigurations).where(eq(aiConfigurations.id, Number(inserted[0].insertId))).limit(1);
  if (!created[0]) throw new Error("Não foi possível criar a configuração inicial da IA.");
  return created[0];
}

export async function updateAiConfiguration(systemPrompt: string, updatedByUserId: number) {
  const db = await requireDb();
  const configuration = await getAiConfiguration();
  await db.update(aiConfigurations).set({ systemPrompt, updatedByUserId }).where(eq(aiConfigurations.id, configuration.id));
  return getAiConfiguration();
}
