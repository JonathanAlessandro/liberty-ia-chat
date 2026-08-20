import { beforeEach, describe, expect, it, vi } from "vitest";

const controller = vi.hoisted(() => ({
  deleteAdminDocument: vi.fn(),
  getAdminAiConfiguration: vi.fn(),
  listAdminDocuments: vi.fn(),
  saveAdminAiConfiguration: vi.fn(),
  uploadAdminDocument: vi.fn(),
}));

vi.mock("../controllers/admin.controller", () => controller);

import { adminRouter } from "./admin.routes";

const administrator = {
  id: 7,
  openId: "admin-user",
  email: "admin@example.com",
  name: "Admin",
  loginMethod: "local",
  role: "admin" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

describe("admin AI configuration route", () => {
  beforeEach(() => vi.resetAllMocks());

  it("stores a valid system prompt on behalf of the authenticated administrator", async () => {
    controller.saveAdminAiConfiguration.mockResolvedValue({ id: 1, systemPrompt: "a".repeat(48) });
    const caller = adminRouter.createCaller({ user: administrator, localUser: null, adminUser: administrator } as never);

    const result = await caller.saveAiConfiguration({ systemPrompt: `  ${"a".repeat(48)}  ` });

    expect(controller.saveAdminAiConfiguration).toHaveBeenCalledWith("a".repeat(48), 7);
    expect(result.systemPrompt).toHaveLength(48);
  });

  it("rejects a system prompt that is too short to be useful", async () => {
    const caller = adminRouter.createCaller({ user: administrator, localUser: null, adminUser: administrator } as never);

    await expect(caller.saveAiConfiguration({ systemPrompt: "curto" })).rejects.toThrow();
    expect(controller.saveAdminAiConfiguration).not.toHaveBeenCalled();
  });

  it("returns folder-origin metadata unchanged for the monitored knowledge library", async () => {
    controller.listAdminDocuments.mockResolvedValue([
      {
        id: 18,
        originalName: "coberturas.xlsx",
        sourceOrigin: "folder",
        sourceKind: "spreadsheet",
        sourcePath: "produtos/coberturas.xlsx",
        sourceFingerprint: "a".repeat(64),
        status: "ready",
      },
    ]);
    const caller = adminRouter.createCaller({ user: administrator, localUser: null, adminUser: administrator } as never);

    const result = await caller.documents();

    expect(controller.listAdminDocuments).toHaveBeenCalledTimes(1);
    expect(result[0]).toMatchObject({
      sourceOrigin: "folder",
      sourceKind: "spreadsheet",
      sourcePath: "produtos/coberturas.xlsx",
    });
  });
});
