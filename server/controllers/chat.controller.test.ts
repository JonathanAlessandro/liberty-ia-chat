import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  addConversationMessage: vi.fn(),
  findOrCreateConversation: vi.fn(),
  listConversationMessages: vi.fn(),
}));
const context = vi.hoisted(() => ({ answerWithDocumentContext: vi.fn() }));

vi.mock("../repositories/conversation.repository", () => repository);
vi.mock("../services/chat-context.service", () => context);

import { askChatQuestion, getChatHistory } from "./chat.controller";

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
    repository.listConversationMessages.mockResolvedValue([
      { role: "user", content: "Pergunta anterior de A" },
      { role: "assistant", content: "Resposta anterior de A" },
    ]);

    await askChatQuestion({ userId: 7, visitorId: "visitor-a", conversationId: 31, question: "Nova pergunta de A" });

    expect(repository.findOrCreateConversation).toHaveBeenCalledWith(7, "visitor-a", 31);
    expect(repository.listConversationMessages).toHaveBeenCalledWith(31, 7, "visitor-a");
    expect(context.answerWithDocumentContext).toHaveBeenCalledWith("Nova pergunta de A", [
      { role: "user", content: "Pergunta anterior de A" },
      { role: "assistant", content: "Resposta anterior de A" },
    ]);
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

  it("keeps histories independent when different users ask from the same browser at the same time", async () => {
    repository.findOrCreateConversation.mockImplementation(async (userId: number, visitorId: string) => ({
      id: userId === 11 ? 101 : 202,
      visitorId,
    }));
    repository.listConversationMessages.mockImplementation(async (_conversationId: number, userId: number) => [
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
    ]);
    expect(context.answerWithDocumentContext).toHaveBeenCalledWith("Pergunta de B", [
      { role: "user", content: "Histórico privado da conta 22" },
    ]);
  });
});
