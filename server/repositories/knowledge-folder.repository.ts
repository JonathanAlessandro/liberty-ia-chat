import { asc, eq } from "drizzle-orm";
import { documents, knowledgeFolders } from "../../drizzle/schema";
import { getDb } from "../db";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

export async function listKnowledgeFolders() {
  const db = await requireDb();
  return db.select().from(knowledgeFolders).orderBy(asc(knowledgeFolders.name));
}

export async function getKnowledgeFolder(folderId: number) {
  const db = await requireDb();
  const result = await db.select().from(knowledgeFolders).where(eq(knowledgeFolders.id, folderId)).limit(1);
  return result[0] ?? null;
}

export async function createKnowledgeFolder(name: string, userId: number) {
  const db = await requireDb();
  const inserted = await db.insert(knowledgeFolders).values({ name, createdByUserId: userId });
  return getKnowledgeFolder(Number(inserted[0].insertId));
}

export async function renameKnowledgeFolder(folderId: number, name: string) {
  const db = await requireDb();
  await db.transaction(async tx => {
    await tx.update(knowledgeFolders).set({ name }).where(eq(knowledgeFolders.id, folderId));
    await tx.update(documents).set({ sourceGroup: name }).where(eq(documents.folderId, folderId));
  });
  return getKnowledgeFolder(folderId);
}
