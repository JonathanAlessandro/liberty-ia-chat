import { answerWithDocumentContext } from "../services/chat-context.service";
import { addConversationMessage, deleteUserConversation, findOrCreateConversation, listConversationMessages, listRecentConversationMessages, listUserConversations } from "../repositories/conversation.repository";
import { chatTimer, createChatTrace, logChatStage } from "../services/chat-observability.service";
import { TRPCError } from "@trpc/server";

export async function askChatQuestion(input: {
  userId: number;
  visitorId: string;
  conversationId?: number;
  question: string;
}) {
  const trace = createChatTrace();
  logChatStage(trace, "request", "started");
  try {
    let startedAt = chatTimer();
    logChatStage(trace, "conversation_lookup", "started");
    const conversation = await findOrCreateConversation(input.userId, input.visitorId, input.conversationId);
    const history = await listRecentConversationMessages(conversation.id, input.userId, input.visitorId);
    logChatStage(trace, "conversation_lookup", "completed", startedAt, { historyMessages: history.length });

    startedAt = chatTimer();
    logChatStage(trace, "persist_question", "started");
    await addConversationMessage({ conversationId: conversation.id, role: "user", content: input.question });
    logChatStage(trace, "persist_question", "completed", startedAt);

    const answer = await answerWithDocumentContext(
      input.question,
      history.map(message => ({ role: message.role, content: message.content })),
      trace,
    );

    startedAt = chatTimer();
    logChatStage(trace, "persist_answer", "started");
    await addConversationMessage({ conversationId: conversation.id, role: "assistant", content: answer.answer, sources: answer.sources });
    logChatStage(trace, "persist_answer", "completed", startedAt, { sourceCount: answer.sources.length });
    logChatStage(trace, "request", "completed", trace.requestStartedAt, { responseMode: answer.responseMode });
    return { conversationId: conversation.id, ...answer };
  } catch (error) {
    logChatStage(trace, "request", "failed", trace.requestStartedAt, { errorType: error instanceof Error ? error.name : "unknown" });
    throw error;
  }
}

export async function getChatHistory(conversationId: number, userId: number, visitorId: string) {
  return listConversationMessages(conversationId, userId, visitorId);
}

export async function getUserConversations(userId: number, visitorId: string) {
  return listUserConversations(userId, visitorId);
}

export async function deleteChatConversation(conversationId: number, userId: number, visitorId: string) {
  if (!await deleteUserConversation(conversationId, userId, visitorId)) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Conversa não encontrada." });
  }
  return { success: true };
}
