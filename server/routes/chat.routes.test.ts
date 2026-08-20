import { beforeEach, describe, expect, it, vi } from "vitest";

const controller = vi.hoisted(() => ({ askChatQuestion: vi.fn(), getChatHistory: vi.fn() }));
vi.mock("../controllers/chat.controller", () => controller);

import { chatRouter } from "./chat.routes";

const user = { id: 42, openId: "local-user:test", name: "Pessoa", email: "pessoa@example.com", loginMethod: "local", role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
const input = { visitorId: "6d10e4f6-6bfb-47f2-9cc7-19d01bf4895e", question: "Minha pergunta" };

describe("private chat routes", () => {
  beforeEach(() => vi.resetAllMocks());

  it("rejects unauthenticated requests", async () => {
    const caller = chatRouter.createCaller({ user: null, localUser: null, adminUser: null, req: {} as never, res: {} as never });
    await expect(caller.ask(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("passes the authenticated user id to the chat controller", async () => {
    controller.askChatQuestion.mockResolvedValue({ conversationId: 1, answer: "Resposta", sources: [], hasContext: true });
    const caller = chatRouter.createCaller({ user, localUser: { ...user, mustChangePassword: false }, adminUser: null, req: {} as never, res: {} as never });
    await caller.ask(input);
    expect(controller.askChatQuestion).toHaveBeenCalledWith({ ...input, userId: 42 });
  });
});
