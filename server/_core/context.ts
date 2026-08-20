import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { getLocalAdminFromRequest } from "../middlewares/local-admin-auth.middleware";
import { getLocalUserFromRequest } from "../services/local-user-auth.service";

export type LocalSessionUser = User & { mustChangePassword?: boolean };

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  localUser: LocalSessionUser | null;
  adminUser: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const [adminUser, localUser] = await Promise.all([
    getLocalAdminFromRequest(opts.req),
    getLocalUserFromRequest(opts.req),
  ]);

  return {
    req: opts.req,
    res: opts.res,
    // Mantém o painel administrativo compatível com `auth.me`, sem misturar a
    // identidade administrativa com operações que exigem uma conta local.
    user: adminUser ?? localUser,
    adminUser,
    localUser,
  };
}
