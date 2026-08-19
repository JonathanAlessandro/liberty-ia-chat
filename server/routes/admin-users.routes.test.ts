import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({ listLocalUsers: vi.fn(), replaceLocalUserPassword: vi.fn(), setLocalUserActive: vi.fn() }));
const auth = vi.hoisted(() => ({ hashLocalPassword: vi.fn(), registerLocalUser: vi.fn() }));
vi.mock("../repositories/local-user.repository", () => repository);
vi.mock("../services/local-user-auth.service", () => auth);

import { adminUsersRouter } from "./admin-users.routes";

const admin = { id: 1, openId: "local-admin:admin@example.com", name: "Admin", email: "admin@example.com", loginMethod: "local", role: "admin" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
const regularUser = { ...admin, id: 2, openId: "local-user:test", role: "user" as const };

describe("admin user management routes", () => {
  beforeEach(() => vi.resetAllMocks());

  it("rejects a non-admin caller", async () => {
    const caller = adminUsersRouter.createCaller({ user: regularUser, req: {} as never, res: {} as never });
    await expect(caller.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("creates a local account with a temporary password", async () => {
    auth.registerLocalUser.mockResolvedValue({ user: { id: 9, name: "Pessoa", email: "pessoa@example.com" } });
    const caller = adminUsersRouter.createCaller({ user: admin, req: {} as never, res: {} as never });
    const result = await caller.create({ name: "Pessoa", email: "pessoa@example.com", temporaryPassword: "SenhaTemporaria#2026" });
    expect(auth.registerLocalUser).toHaveBeenCalledWith({ name: "Pessoa", email: "pessoa@example.com", password: "SenhaTemporaria#2026" });
    expect(result).toEqual({ id: 9, name: "Pessoa", email: "pessoa@example.com" });
  });
});
