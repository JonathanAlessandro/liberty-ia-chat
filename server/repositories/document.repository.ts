import { and, desc, eq, inArray, like, sql } from "drizzle-orm";
import { aiConfigurations, documentChunks, documents } from "../../drizzle/schema";
import type { IndexedChunk } from "../models/liberty-ai.models";
import { getDb } from "../db";

/** Centraliza a exigência de conexão para as operações deste repositório. */
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

/** Localiza somente fontes web sob um caminho; usado para sincronizar listas de URLs. */
export async function listDocumentsBySourcePathPrefix(prefix: string) {
  const db = await requireDb();
  return db.select().from(documents).where(and(like(documents.sourcePath, `${prefix}%`), eq(documents.sourceKind, "web")));
}

/** Registra um upload antes da extração; ele só entra nas buscas quando estiver ready. */
export async function createDocument(input: { originalName: string; storageKey: string; sizeBytes: number; mimeType: string; sourceKind: "pdf" | "spreadsheet"; folderId?: number | null; sourceGroup?: string | null; createdByUserId: number }) {
  const db = await requireDb();
  const inserted = await db.insert(documents).values({ ...input, sourceOrigin: "upload", status: "processing" });
  const id = Number(inserted[0].insertId);
  const document = await getDocumentById(id);
  if (!document) throw new Error("Não foi possível criar o registro do documento.");
  return document;
}

/** Reaproveita o registro de um arquivo monitorado quando seu conteúdo muda. */
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
  // A nova versão ainda não deve ser consultada; os dados de extração anteriores
  // deixam de representar o arquivo atualizado até a indexação terminar.
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

/** Troca todos os trechos do documento e publica a nova versão de forma atômica. */
export async function completeDocumentIndexing(documentId: number, pageCount: number, chunks: IndexedChunk[]) {
  const db = await requireDb();
  await db.transaction(async tx => {
    await tx.delete(documentChunks).where(eq(documentChunks.documentId, documentId));
    // Lotes menores evitam uma única inserção SQL muito grande.
    for (let start = 0; start < chunks.length; start += 500) {
      const batch = chunks.slice(start, start + 500);
      await tx.insert(documentChunks).values(batch.map(chunk => ({ documentId, content: chunk.content, pageStart: chunk.pageStart, pageEnd: chunk.pageEnd, ordinal: chunk.ordinal })));
    }
    await tx.update(documents).set({ status: "ready", pageCount, extractedAt: new Date(), errorMessage: null }).where(eq(documents.id, documentId));
  });
}

/** Persiste a falha para exibição no painel e exclui o documento das buscas. */
export async function failDocumentIndexing(documentId: number, errorMessage: string) {
  const db = await requireDb();
  await db.update(documents).set({ status: "failed", errorMessage: errorMessage.slice(0, 1000) }).where(eq(documents.id, documentId));
}

/** A FK em documentChunks remove os trechos relacionados; não apaga o objeto no S3. */
export async function removeDocument(documentId: number) {
  const db = await requireDb();
  await db.delete(documents).where(eq(documents.id, documentId));
}

// Mantém os metadados necessários para classificar trechos e citar suas fontes.
const readyChunkSelection = {
  chunkId: documentChunks.id,
  content: documentChunks.content,
  pageStart: documentChunks.pageStart,
  pageEnd: documentChunks.pageEnd,
  documentId: documents.id,
  documentName: documents.originalName,
  sourceKind: documents.sourceKind,
  sourceAuthority: documents.sourceAuthority,
  sourceGroup: documents.sourceGroup,
  effectiveAt: documents.effectiveAt,
  storageKey: documents.storageKey,
};

/** Pré-filtra candidatos no MariaDB; o ranking final ocorre em chat-context.service. */
export async function listChatDocumentCatalog() {
  const db = await requireDb();
  return db.select({ id: documents.id, name: documents.originalName, group: documents.sourceGroup })
    .from(documents).where(and(eq(documents.status, "ready"), eq(documents.sourceKind, "pdf"))).limit(500);
}

export async function searchReadyChunksWithDocuments(needles: string[], limit = 80, documentIds?: number[]) {
  const db = await requireDb();
  // Deduplica e limita termos para manter a consulta previsível.
  const normalized = Array.from(new Set(needles
    .map(value => value.trim().toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]/g, "").slice(0, 64))
    .filter(Boolean))).slice(0, 24);
  if (!normalized.length) return [];

  // FULLTEXT evita executar vários LIKE '%termo%' sobre todo o conteúdo. Prefixos
  // como "psico*" preservam a busca flexível usada pelo ranking em memória.
  const fullTextTerms = normalized.filter(term => term.length >= 3);
  if (fullTextTerms.length) {
    const booleanQuery = fullTextTerms.map(term => `${term}*`).join(" ");
    const fullTextScore = sql<number>`MATCH(${documentChunks.content}) AGAINST (${booleanQuery} IN BOOLEAN MODE)`;
    return db
      .select(readyChunkSelection)
      .from(documentChunks)
      .innerJoin(documents, eq(documentChunks.documentId, documents.id))
      .where(and(eq(documents.status, "ready"), documentIds?.length ? inArray(documents.id, documentIds) : undefined, sql`${fullTextScore} > 0`))
      .orderBy(desc(fullTextScore), desc(documents.effectiveAt))
      .limit(Math.min(Math.max(limit, 1), 200));
  }

  // Códigos exclusivamente numéricos podem ser ignorados pelo FULLTEXT do
  // MariaDB. Nesse caso raro, faça uma única varredura em vez de uma por termo.
  const numericNeedle = normalized[0]!;
  return db
    .select(readyChunkSelection)
    .from(documentChunks)
    .innerJoin(documents, eq(documentChunks.documentId, documents.id))
    .where(and(eq(documents.status, "ready"), documentIds?.length ? inArray(documents.id, documentIds) : undefined, like(documentChunks.content, `%${numericNeedle}%`)))
    .orderBy(desc(documents.effectiveAt))
    .limit(Math.min(Math.max(limit, 1), 200));
}

/** Reindexação manual: impede consultas ao documento até a nova extração terminar. */
export async function markDocumentProcessing(documentId: number) {
  const db = await requireDb();
  await db.update(documents).set({ status: "processing", errorMessage: null }).where(eq(documents.id, documentId));
}

/** A pasta também define o grupo usado na classificação das fontes. */
export async function moveDocumentToFolder(documentId: number, folder: { id: number; name: string } | null) {
  const db = await requireDb();
  await db.update(documents).set({ folderId: folder?.id ?? null, sourceGroup: folder?.name ?? null }).where(eq(documents.id, documentId));
  return getDocumentById(documentId);
}

/** Recupera apenas páginas oficiais cadastradas e prontas para consulta. */
export async function listReadyRegisteredWebDocuments() {
  const db = await requireDb();
  return db
    .select({ id: documents.id, originalName: documents.originalName, storageKey: documents.storageKey, sourceGroup: documents.sourceGroup })
    .from(documents)
    .where(and(eq(documents.status, "ready"), eq(documents.sourceKind, "web"), eq(documents.sourceAuthority, "official_registered")))
    .limit(25);
}

const DEFAULT_SYSTEM_PROMPT = `Você é a LibertyAI. Responda em português do Brasil, de forma clara, acolhedora e objetiva. Use documentos internos de treinamento como fonte relevante e páginas oficiais previamente cadastradas como referência complementar. Quando uma página oficial cadastrada trouxer vigência, versão ou atualização comprovadamente posterior a um documento interno conflitante, informe o critério e priorize a fonte mais recente. Se não for possível comparar vigência, explique o conflito e oriente confirmação com a operadora. Se não houver documentos nem fontes externas disponíveis, ofereça orientação geral útil, mas deixe explícito que ela não foi baseada no acervo da LibertyAI. Não atribua regras, prazos, preços ou procedimentos à LibertyAI sem fontes. Quando for útil, cite as fontes documentais e externas informadas no contexto.`;

/** Cria a configuração padrão na primeira leitura; depois usa a mais recente. */
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
