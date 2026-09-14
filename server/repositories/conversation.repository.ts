import { and, asc, desc, eq, lt, sql } from "drizzle-orm";
import { conversations, messages } from "../../drizzle/schema";
import type { SourceReference } from "../models/liberty-ai.models";
import { getDb } from "../db";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

export async function findOrCreateConversation(userId: number, visitorId: string, conversationId?: number) {
  const db = await requireDb();
  if (conversationId) {
    const existing = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.ownerUserId, userId)))
      .limit(1);
    if (existing[0] && existing[0].visitorId === visitorId) return existing[0];
  }

  const inserted = await db.insert(conversations).values({ visitorId, ownerUserId: userId });
  const id = Number(inserted[0].insertId);
  const created = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  if (!created[0]) throw new Error("Não foi possível iniciar a conversa.");
  return created[0];
}

export async function listUserConversations(userId: number, visitorId: string) {
  const db = await requireDb();
  return db.select({ id: conversations.id, title: conversations.title, createdAt: conversations.createdAt, updatedAt: conversations.updatedAt })
    .from(conversations)
    .where(and(eq(conversations.ownerUserId, userId), eq(conversations.visitorId, visitorId)))
    .orderBy(desc(conversations.updatedAt), desc(conversations.id));
}

export async function deleteUserConversation(conversationId: number, userId: number, visitorId: string) {
  const db = await requireDb();
  const result = await db.delete(conversations).where(and(
    eq(conversations.id, conversationId),
    eq(conversations.ownerUserId, userId),
    eq(conversations.visitorId, visitorId),
  ));
  return Number(result[0]?.affectedRows ?? 0) > 0;
}

export async function addConversationMessage(input: {
  conversationId: number;
  role: "user" | "assistant";
  content: string;
  sources?: SourceReference[];
}) {
  const db = await requireDb();
  await db.insert(messages).values({
    conversationId: input.conversationId,
    role: input.role,
    content: input.content,
    sourcesJson: input.sources?.length ? JSON.stringify(input.sources) : null,
    retentionPolicy: "permanent",
  });
  if (input.role === "user") {
    const title = input.content.trim().replace(/\s+/g, " ").slice(0, 180);
    await db.update(conversations).set({
      title: sql`COALESCE(${conversations.title}, ${title})`,
      updatedAt: new Date(),
    }).where(eq(conversations.id, input.conversationId));
  }
}

export async function listConversationMessages(conversationId: number, userId: number, visitorId: string) {
  const db = await requireDb();
  const conversation = await db.select().from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.ownerUserId, userId))).limit(1);
  if (!conversation[0] || conversation[0].visitorId !== visitorId) return [];
  return db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(asc(messages.id));
}

export async function listRecentConversationMessages(conversationId: number, userId: number, visitorId: string, limit = 3) {
  const db = await requireDb();
  const conversation = await db.select({ id: conversations.id }).from(conversations).where(and(
    eq(conversations.id, conversationId), eq(conversations.ownerUserId, userId), eq(conversations.visitorId, visitorId),
  )).limit(1);
  if (!conversation[0]) return [];
  const recent = await db.select().from(messages).where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.id)).limit(limit);
  return recent.reverse();
}

export async function deleteMessagesOlderThan(cutoff: Date) {
  const db = await requireDb();
  const result = await db.delete(messages).where(and(
    eq(messages.retentionPolicy, "legacy_7_days"),
    lt(messages.createdAt, cutoff),
  ));
  return Number(result[0]?.affectedRows ?? 0);
}
