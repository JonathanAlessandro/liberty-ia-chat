import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  addConversationMessage: vi.fn(),
  deleteUserConversation: vi.fn(),
  findOrCreateConversation: vi.fn(),
  listConversationMessages: vi.fn(),
  listRecentConversationMessages: vi.fn(),
  listUserConversations: vi.fn(),
}));
const context = vi.hoisted(() => ({ answerWithDocumentContext: vi.fn() }));

vi.mock("../repositories/conversation.repository", () => repository);
vi.mock("../services/chat-context.service", () => context);

import { askChatQuestion, deleteChatConversation, getChatHistory, getUserConversations } from "./chat.controller";

describe("chat controller conversation isolation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    repository.findOrCreateConversation.mockResolvedValue({ id: 31, visitorId: "visitor-a" });
    context.answerWithDocumentContext.mockResolvedValue({
      answer: "Resposta documental.",
      sources: [{ documentId: 1, documentName: "Manual.pdf", pageStart: 2, pageEnd: 2 }],
      hasContext: true,
    });
  });

  it("uses only the messages owned by the authenticated user and current browser before producing a response", async () => {
    repository.listRecentConversationMessages.mockResolvedValue([
      { role: "user", content: "Pergunta anterior de A" },
      { role: "assistant", content: "Resposta anterior de A" },
    ]);

    await askChatQuestion({ userId: 7, visitorId: "visitor-a", conversationId: 31, question: "Nova pergunta de A" });

    expect(repository.findOrCreateConversation).toHaveBeenCalledWith(7, "visitor-a", 31);
    expect(repository.listRecentConversationMessages).toHaveBeenCalledWith(31, 7, "visitor-a");
    expect(context.answerWithDocumentContext).toHaveBeenCalledWith(
      "Nova pergunta de A",
      [
        { role: "user", content: "Pergunta anterior de A" },
        { role: "assistant", content: "Resposta anterior de A" },
      ],
      expect.objectContaining({ id: expect.any(String), requestStartedAt: expect.any(Number) }),
    );
    expect(repository.addConversationMessage).toHaveBeenNthCalledWith(1, {
      conversationId: 31,
      role: "user",
      content: "Nova pergunta de A",
    });
    expect(repository.addConversationMessage).toHaveBeenNthCalledWith(2, {
      conversationId: 31,
      role: "assistant",
      content: "Resposta documental.",
      sources: [{ documentId: 1, documentName: "Manual.pdf", pageStart: 2, pageEnd: 2 }],
    });
  });

  it("passes account and visitor identifiers when reading a stored conversation", async () => {
    repository.listConversationMessages.mockResolvedValue([]);

    await getChatHistory(99, 8, "visitor-b");

    expect(repository.listConversationMessages).toHaveBeenCalledWith(99, 8, "visitor-b");
  });

  it("starts without prior context when the user resets the active conversation", async () => {
    repository.findOrCreateConversation.mockResolvedValue({ id: 44, visitorId: "visitor-a" });
    repository.listRecentConversationMessages.mockResolvedValue([]);

    await askChatQuestion({ userId: 7, visitorId: "visitor-a", question: "Pergunta após reiniciar" });

    expect(repository.findOrCreateConversation).toHaveBeenCalledWith(7, "visitor-a", undefined);
    expect(repository.listRecentConversationMessages).toHaveBeenCalledWith(44, 7, "visitor-a");
    expect(context.answerWithDocumentContext).toHaveBeenCalledWith(
      "Pergunta após reiniciar",
      [],
      expect.objectContaining({ id: expect.any(String) }),
    );
  });

  it("keeps histories independent when different users ask from the same browser at the same time", async () => {
    repository.findOrCreateConversation.mockImplementation(async (userId: number, visitorId: string) => ({
      id: userId === 11 ? 101 : 202,
      visitorId,
    }));
    repository.listRecentConversationMessages.mockImplementation(async (_conversationId: number, userId: number) => [
      { role: "user", content: `Histórico privado da conta ${userId}` },
    ]);
    context.answerWithDocumentContext.mockImplementation(async (question: string) => ({
      answer: `Resposta para ${question}`,
      sources: [],
      hasContext: true,
    }));

    await Promise.all([
      askChatQuestion({ userId: 11, visitorId: "shared-browser", question: "Pergunta de A" }),
      askChatQuestion({ userId: 22, visitorId: "shared-browser", question: "Pergunta de B" }),
    ]);

    expect(context.answerWithDocumentContext).toHaveBeenCalledWith("Pergunta de A", [
      { role: "user", content: "Histórico privado da conta 11" },
    ], expect.objectContaining({ id: expect.any(String) }));
    expect(context.answerWithDocumentContext).toHaveBeenCalledWith("Pergunta de B", [
      { role: "user", content: "Histórico privado da conta 22" },
    ], expect.objectContaining({ id: expect.any(String) }));
  });

  it("lists and deletes only a conversation belonging to the current user and browser", async () => {
    repository.listUserConversations.mockResolvedValue([{ id: 31, title: "Minha pergunta" }]);
    repository.deleteUserConversation.mockResolvedValue(true);

    await expect(getUserConversations(7, "visitor-a")).resolves.toEqual([{ id: 31, title: "Minha pergunta" }]);
    await expect(deleteChatConversation(31, 7, "visitor-a")).resolves.toEqual({ success: true });

    expect(repository.listUserConversations).toHaveBeenCalledWith(7, "visitor-a");
    expect(repository.deleteUserConversation).toHaveBeenCalledWith(31, 7, "visitor-a");
  });

  it("does not report success when a chat does not belong to the requester", async () => {
    repository.deleteUserConversation.mockResolvedValue(false);
    await expect(deleteChatConversation(31, 7, "visitor-b")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
