import { index, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const documents = mysqlTable(
  "documents",
  {
    id: int("id").autoincrement().primaryKey(),
    originalName: varchar("originalName", { length: 255 }).notNull(),
    storageKey: varchar("storageKey", { length: 512 }).notNull(),
    mimeType: varchar("mimeType", { length: 128 }).notNull().default("application/pdf"),
    sourceKind: varchar("sourceKind", { length: 32 }).notNull().default("pdf"),
    sourceOrigin: varchar("sourceOrigin", { length: 32 }).notNull().default("upload"),
    sourcePath: varchar("sourcePath", { length: 512 }),
    sourceFingerprint: varchar("sourceFingerprint", { length: 64 }),
    sizeBytes: int("sizeBytes").notNull(),
    status: mysqlEnum("status", ["processing", "ready", "failed"]).notNull().default("processing"),
    errorMessage: text("errorMessage"),
    pageCount: int("pageCount"),
    extractedAt: timestamp("extractedAt"),
    createdByUserId: int("createdByUserId").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("documents_created_by_idx").on(table.createdByUserId),
    index("documents_status_idx").on(table.status),
    index("documents_source_path_idx").on(table.sourcePath),
    index("documents_source_origin_idx").on(table.sourceOrigin),
  ],
);

export const documentChunks = mysqlTable(
  "documentChunks",
  {
    id: int("id").autoincrement().primaryKey(),
    documentId: int("documentId")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    pageStart: int("pageStart").notNull(),
    pageEnd: int("pageEnd").notNull(),
    ordinal: int("ordinal").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("document_chunks_document_idx").on(table.documentId),
    index("document_chunks_ordinal_idx").on(table.documentId, table.ordinal),
  ],
);

export const aiConfigurations = mysqlTable("aiConfigurations", {
  id: int("id").autoincrement().primaryKey(),
  systemPrompt: text("systemPrompt").notNull(),
  updatedByUserId: int("updatedByUserId").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const conversations = mysqlTable(
  "conversations",
  {
    id: int("id").autoincrement().primaryKey(),
    visitorId: varchar("visitorId", { length: 128 }).notNull(),
    ownerUserId: int("ownerUserId").references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 180 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("conversations_visitor_idx").on(table.visitorId), index("conversations_owner_user_idx").on(table.ownerUserId)],
);

export const localUserAccounts = mysqlTable(
  "localUserAccounts",
  {
    userId: int("userId").primaryKey().references(() => users.id, { onDelete: "cascade" }),
    passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
    isActive: int("isActive").notNull().default(1),
    mustChangePassword: int("mustChangePassword").notNull().default(1),
    passwordUpdatedAt: timestamp("passwordUpdatedAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("local_user_accounts_active_idx").on(table.isActive)],
);

export const localUserSessions = mysqlTable(
  "localUserSessions",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  },
  table => [index("local_user_sessions_user_idx").on(table.userId), index("local_user_sessions_expires_idx").on(table.expiresAt)],
);

export const messages = mysqlTable(
  "messages",
  {
    id: int("id").autoincrement().primaryKey(),
    conversationId: int("conversationId")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: mysqlEnum("role", ["user", "assistant"]).notNull(),
    content: text("content").notNull(),
    sourcesJson: text("sourcesJson"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("messages_conversation_idx").on(table.conversationId)],
);

export type Document = typeof documents.$inferSelect;
export type DocumentChunk = typeof documentChunks.$inferSelect;
export type AiConfiguration = typeof aiConfigurations.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type LocalUserAccount = typeof localUserAccounts.$inferSelect;
