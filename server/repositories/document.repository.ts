import { desc, eq } from "drizzle-orm";
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

export async function createDocument(input: {
  originalName: string;
  storageKey: string;
  sizeBytes: number;
  createdByUserId: number;
}) {
  const db = await requireDb();
  const inserted = await db.insert(documents).values({
    ...input,
    mimeType: "application/pdf",
    status: "processing",
  });
  const id = Number(inserted[0].insertId);
  const document = await getDocumentById(id);
  if (!document) throw new Error("Não foi possível criar o registro do documento.");
  return document;
}

export async function completeDocumentIndexing(documentId: number, pageCount: number, chunks: IndexedChunk[]) {
  const db = await requireDb();
  await db.transaction(async tx => {
    await tx.delete(documentChunks).where(eq(documentChunks.documentId, documentId));
    if (chunks.length > 0) {
      await tx.insert(documentChunks).values(
        chunks.map(chunk => ({
          documentId,
          content: chunk.content,
          pageStart: chunk.pageStart,
          pageEnd: chunk.pageEnd,
          ordinal: chunk.ordinal,
        })),
      );
    }
    await tx
      .update(documents)
      .set({ status: "ready", pageCount, extractedAt: new Date(), errorMessage: null })
      .where(eq(documents.id, documentId));
  });
}

export async function failDocumentIndexing(documentId: number, errorMessage: string) {
  const db = await requireDb();
  await db
    .update(documents)
    .set({ status: "failed", errorMessage: errorMessage.slice(0, 1000) })
    .where(eq(documents.id, documentId));
}

export async function removeDocument(documentId: number) {
  const db = await requireDb();
  await db.delete(documents).where(eq(documents.id, documentId));
}

export async function getReadyChunksWithDocuments() {
  const db = await requireDb();
  return db
    .select({
      chunkId: documentChunks.id,
      content: documentChunks.content,
      pageStart: documentChunks.pageStart,
      pageEnd: documentChunks.pageEnd,
      documentId: documents.id,
      documentName: documents.originalName,
    })
    .from(documentChunks)
    .innerJoin(documents, eq(documentChunks.documentId, documents.id))
    .where(eq(documents.status, "ready"));
}

const DEFAULT_SYSTEM_PROMPT = `Você é a LibertyAI. Responda em português do Brasil, de forma clara, acolhedora e objetiva. Priorize os documentos fornecidos como fonte principal. Quando o contexto disponibilizar fontes externas, use-as apenas para complementar as informações e deixe essa origem explícita. Não invente informações nem faça suposições. Quando não houver evidência suficiente nos documentos nem nas fontes externas consultadas, informe isso claramente. Quando for útil, cite as fontes documentais e externas informadas no contexto.`;

export async function getAiConfiguration() {
  const db = await requireDb();
  const existing = await db.select().from(aiConfigurations).orderBy(desc(aiConfigurations.updatedAt)).limit(1);
  if (existing[0]) return existing[0];

  const inserted = await db.insert(aiConfigurations).values({ systemPrompt: DEFAULT_SYSTEM_PROMPT });
  const id = Number(inserted[0].insertId);
  const created = await db.select().from(aiConfigurations).where(eq(aiConfigurations.id, id)).limit(1);
  if (!created[0]) throw new Error("Não foi possível criar a configuração inicial da IA.");
  return created[0];
}

export async function updateAiConfiguration(systemPrompt: string, updatedByUserId: number) {
  const db = await requireDb();
  const configuration = await getAiConfiguration();
  await db
    .update(aiConfigurations)
    .set({ systemPrompt, updatedByUserId })
    .where(eq(aiConfigurations.id, configuration.id));
  return getAiConfiguration();
}
