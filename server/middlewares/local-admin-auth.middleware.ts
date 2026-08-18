import { timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { Request as ExpressRequest } from "express";
import type { User } from "../../drizzle/schema";
import { getUserByOpenId, upsertUser } from "../db";
import { getSessionCookieOptions } from "../_core/cookies";

export const LOCAL_ADMIN_COOKIE = "libertyai_admin_session";
const TOKEN_AUDIENCE = "libertyai-admin";
const TOKEN_ISSUER = "libertyai";

function getConfiguration() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.LOCAL_AUTH_SECRET || process.env.JWT_SECRET;
  if (!email || !password || !secret) return null;
  return { email, password, secret };
}

function getSecret(secret: string) {
  return new TextEncoder().encode(secret);
}

function readCookie(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) return undefined;
  return cookieHeader
    .split(";")
    .map(value => value.trim().split("="))
    .find(([key]) => key === name)
    ?.slice(1)
    .join("=");
}

function credentialsMatch(expected: string, received: string) {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

async function ensureLocalAdmin(email: string): Promise<User | null> {
  const openId = `local-admin:${email}`;
  await upsertUser({ openId, email, name: "Administrador LibertyAI", loginMethod: "local", role: "admin" });
  return (await getUserByOpenId(openId)) ?? null;
}

export async function authenticateLocalAdmin(email: string, password: string) {
  const configuration = getConfiguration();
  if (!configuration) throw new Error("O acesso local não está configurado no servidor.");
  if (email.trim().toLowerCase() !== configuration.email || !credentialsMatch(configuration.password, password)) {
    return null;
  }
  return ensureLocalAdmin(configuration.email);
}

export async function createLocalAdminToken(email: string) {
  const configuration = getConfiguration();
  if (!configuration) throw new Error("O acesso local não está configurado no servidor.");
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(TOKEN_ISSUER)
    .setAudience(TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(getSecret(configuration.secret));
}

export async function getLocalAdminFromRequest(req: ExpressRequest): Promise<User | null> {
  const configuration = getConfiguration();
  const token = readCookie(req.headers.cookie, LOCAL_ADMIN_COOKIE);
  if (!configuration || !token) return null;
  try {
    const verified = await jwtVerify(token, getSecret(configuration.secret), { issuer: TOKEN_ISSUER, audience: TOKEN_AUDIENCE });
    const email = typeof verified.payload.email === "string" ? verified.payload.email.toLowerCase() : "";
    if (email !== configuration.email) return null;
    return ensureLocalAdmin(email);
  } catch {
    return null;
  }
}

export function getLocalAdminCookieOptions(req: ExpressRequest) {
  return { ...getSessionCookieOptions(req), sameSite: "lax" as const, maxAge: 12 * 60 * 60 * 1000 };
}
