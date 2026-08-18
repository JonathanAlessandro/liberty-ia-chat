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

  it("uses only the messages returned for the current visitor before producing a response", async () => {
    repository.listConversationMessages.mockResolvedValue([
      { role: "user", content: "Pergunta anterior de A" },
      { role: "assistant", content: "Resposta anterior de A" },
    ]);

    await askChatQuestion({ visitorId: "visitor-a", conversationId: 31, question: "Nova pergunta de A" });

    expect(repository.findOrCreateConversation).toHaveBeenCalledWith("visitor-a", 31);
    expect(repository.listConversationMessages).toHaveBeenCalledWith(31, "visitor-a");
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

  it("passes the visitor identifier when reading a stored conversation", async () => {
    repository.listConversationMessages.mockResolvedValue([]);

    await getChatHistory(99, "visitor-b");

    expect(repository.listConversationMessages).toHaveBeenCalledWith(99, "visitor-b");
  });

  it("keeps histories independent when different visitors ask at the same time", async () => {
    repository.findOrCreateConversation.mockImplementation(async (visitorId: string) => ({
      id: visitorId === "visitor-a" ? 101 : 202,
      visitorId,
    }));
    repository.listConversationMessages.mockImplementation(async (_conversationId: number, visitorId: string) => [
      { role: "user", content: `Histórico privado de ${visitorId}` },
    ]);
    context.answerWithDocumentContext.mockImplementation(async (question: string) => ({
      answer: `Resposta para ${question}`,
      sources: [],
      hasContext: true,
    }));

    await Promise.all([
      askChatQuestion({ visitorId: "visitor-a", question: "Pergunta de A" }),
      askChatQuestion({ visitorId: "visitor-b", question: "Pergunta de B" }),
    ]);

    expect(context.answerWithDocumentContext).toHaveBeenCalledWith("Pergunta de A", [
      { role: "user", content: "Histórico privado de visitor-a" },
    ]);
    expect(context.answerWithDocumentContext).toHaveBeenCalledWith("Pergunta de B", [
      { role: "user", content: "Histórico privado de visitor-b" },
    ]);
  });
});
