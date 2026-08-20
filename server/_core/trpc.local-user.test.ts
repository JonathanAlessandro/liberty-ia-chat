import { describe, expect, it } from "vitest";
import { localUserProcedure, router } from "./trpc";

const admin = { id: 1, openId: "local-admin:admin@example.com", name: "Admin", email: "admin@example.com", loginMethod: "local", role: "admin" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
const localUser = { id: 2, openId: "local-user:pessoa@example.com", name: "Pessoa", email: "pessoa@example.com", loginMethod: "local", role: "user" as const, mustChangePassword: true, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };

const testRouter = router({
  currentLocalUser: localUserProcedure.query(({ ctx }) => ({ id: ctx.user.id, email: ctx.user.email })),
});

describe("localUserProcedure", () => {
  it("uses the local-user identity even when an administrator cookie also exists", async () => {
    const caller = testRouter.createCaller({ user: admin, adminUser: admin, localUser, req: {} as never, res: {} as never });

    await expect(caller.currentLocalUser()).resolves.toEqual({ id: 2, email: "pessoa@example.com" });
  });

  it("rejects an administrator-only session from user password and chat operations", async () => {
    const caller = testRouter.createCaller({ user: admin, adminUser: admin, localUser: null, req: {} as never, res: {} as never });

    await expect(caller.currentLocalUser()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
