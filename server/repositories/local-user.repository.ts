import { and, asc, eq, gt } from "drizzle-orm";
import { localUserAccounts, localUserSessions, users } from "../../drizzle/schema";
import { getDb } from "../db";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

export async function findLocalUserByEmail(email: string) {
  const db = await requireDb();
  const result = await db
    .select({ user: users, account: localUserAccounts })
    .from(users)
    .innerJoin(localUserAccounts, eq(localUserAccounts.userId, users.id))
    .where(eq(users.email, email))
    .limit(1);
  return result[0] ?? null;
}

export async function findLocalUserById(userId: number) {
  const db = await requireDb();
  const result = await db
    .select({ user: users, account: localUserAccounts })
    .from(users)
    .innerJoin(localUserAccounts, eq(localUserAccounts.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  return result[0] ?? null;
}

export async function listLocalUsers() {
  const db = await requireDb();
  return db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, isActive: localUserAccounts.isActive, mustChangePassword: localUserAccounts.mustChangePassword, createdAt: localUserAccounts.createdAt, lastSignedIn: users.lastSignedIn })
    .from(users)
    .innerJoin(localUserAccounts, eq(localUserAccounts.userId, users.id))
    .orderBy(asc(users.name));
}

export async function createLocalUser(input: { openId: string; name: string; email: string; passwordHash: string }) {
  const db = await requireDb();
  const inserted = await db.insert(users).values({ openId: input.openId, name: input.name, email: input.email, loginMethod: "local", role: "user", lastSignedIn: new Date() });
  const userId = Number(inserted[0].insertId);
  await db.insert(localUserAccounts).values({ userId, passwordHash: input.passwordHash, isActive: 1, mustChangePassword: 1 });
  return findLocalUserByEmail(input.email);
}

export async function setLocalUserActive(userId: number, isActive: boolean) {
  const db = await requireDb();
  await db.update(localUserAccounts).set({ isActive: isActive ? 1 : 0 }).where(eq(localUserAccounts.userId, userId));
  if (!isActive) await db.delete(localUserSessions).where(eq(localUserSessions.userId, userId));
}

export async function replaceLocalUserPassword(userId: number, passwordHash: string, mustChangePassword: boolean) {
  const db = await requireDb();
  await db.update(localUserAccounts).set({ passwordHash, mustChangePassword: mustChangePassword ? 1 : 0, passwordUpdatedAt: new Date() }).where(eq(localUserAccounts.userId, userId));
  await db.delete(localUserSessions).where(eq(localUserSessions.userId, userId));
}

export async function createLocalUserSession(userId: number, tokenHash: string, expiresAt: Date) {
  const db = await requireDb();
  await db.insert(localUserSessions).values({ userId, tokenHash, expiresAt });
}

export async function findActiveSession(tokenHash: string) {
  const db = await requireDb();
  const result = await db
    .select({ user: users, account: localUserAccounts, sessionId: localUserSessions.id })
    .from(localUserSessions)
    .innerJoin(users, eq(users.id, localUserSessions.userId))
    .innerJoin(localUserAccounts, eq(localUserAccounts.userId, users.id))
    .where(and(eq(localUserSessions.tokenHash, tokenHash), eq(localUserAccounts.isActive, 1), gt(localUserSessions.expiresAt, new Date())))
    .limit(1);
  return result[0] ?? null;
}

export async function touchLocalUserSession(sessionId: number) {
  const db = await requireDb();
  await db.update(localUserSessions).set({ lastSeenAt: new Date() }).where(eq(localUserSessions.id, sessionId));
}

export async function deleteLocalUserSession(tokenHash: string) {
  const db = await requireDb();
  await db.delete(localUserSessions).where(eq(localUserSessions.tokenHash, tokenHash));
}
