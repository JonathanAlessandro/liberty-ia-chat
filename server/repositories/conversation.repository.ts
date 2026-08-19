import { and, asc, eq } from "drizzle-orm";
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
  });
}

export async function listConversationMessages(conversationId: number, userId: number, visitorId: string) {
  const db = await requireDb();
  const conversation = await db.select().from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.ownerUserId, userId))).limit(1);
  if (!conversation[0] || conversation[0].visitorId !== visitorId) return [];
  return db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(asc(messages.createdAt));
}
