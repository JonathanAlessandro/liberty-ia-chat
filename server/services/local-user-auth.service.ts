import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Request as ExpressRequest } from "express";
import type { User } from "../../drizzle/schema";
import { getSessionCookieOptions } from "../_core/cookies";
import { createLocalUser, createLocalUserSession, deleteLocalUserSession, findActiveSession, findLocalUserByEmail, findLocalUserById, replaceLocalUserPassword, touchLocalUserSession } from "../repositories/local-user.repository";

export const LOCAL_USER_COOKIE = "libertyai_user_session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function readCookie(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) return undefined;
  return cookieHeader.split(";").map(value => value.trim().split("=")).find(([key]) => key === name)?.slice(1).join("=");
}

export function hashLocalPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyLocalPassword(password: string, storedValue: string) {
  const [scheme, salt, expected] = storedValue.split("$");
  if (scheme !== "scrypt" || !salt || !expected) return false;
  const received = scryptSync(password, salt, 64).toString("hex");
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

function localOpenId(email: string) {
  return `local-user:${createHash("sha256").update(email).digest("hex").slice(0, 48)}`;
}

export async function registerLocalUser(input: { name: string; email: string; password: string }) {
  const email = normalizeEmail(input.email);
  if (await findLocalUserByEmail(email)) throw new Error("Já existe uma conta com este e-mail.");
  return createLocalUser({ openId: localOpenId(email), name: input.name.trim(), email, passwordHash: hashLocalPassword(input.password) });
}

export async function authenticateLocalUser(email: string, password: string) {
  const entry = await findLocalUserByEmail(normalizeEmail(email));
  if (!entry || entry.account.isActive !== 1 || !verifyLocalPassword(password, entry.account.passwordHash)) return null;
  return entry;
}

export async function createUserSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await createLocalUserSession(userId, hashSessionToken(token), expiresAt);
  return token;
}

export async function getLocalUserFromRequest(req: ExpressRequest): Promise<(User & { mustChangePassword: boolean }) | null> {
  const token = readCookie(req.headers.cookie, LOCAL_USER_COOKIE);
  if (!token) return null;
  const session = await findActiveSession(hashSessionToken(token));
  if (!session) return null;
  await touchLocalUserSession(session.sessionId);
  return { ...session.user, mustChangePassword: session.account.mustChangePassword === 1 };
}

export async function logoutLocalUser(req: ExpressRequest) {
  const token = readCookie(req.headers.cookie, LOCAL_USER_COOKIE);
  if (token) await deleteLocalUserSession(hashSessionToken(token));
}

export async function changeLocalUserPassword(userId: number, currentPassword: string, nextPassword: string) {
  const entry = await findLocalUserById(userId);
  if (!entry || entry.account.isActive !== 1 || !verifyLocalPassword(currentPassword, entry.account.passwordHash)) return false;
  await replaceLocalUserPassword(userId, hashLocalPassword(nextPassword), false);
  return true;
}

export function getLocalUserCookieOptions(req: ExpressRequest) {
  return { ...getSessionCookieOptions(req), sameSite: "lax" as const, maxAge: SESSION_DURATION_MS };
}
