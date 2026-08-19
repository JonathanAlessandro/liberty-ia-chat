import { answerWithDocumentContext } from "../services/chat-context.service";
import { addConversationMessage, findOrCreateConversation, listConversationMessages } from "../repositories/conversation.repository";

export async function askChatQuestion(input: {
  userId: number;
  visitorId: string;
  conversationId?: number;
  question: string;
}) {
  const conversation = await findOrCreateConversation(input.userId, input.visitorId, input.conversationId);
  const history = await listConversationMessages(conversation.id, input.userId, input.visitorId);
  await addConversationMessage({ conversationId: conversation.id, role: "user", content: input.question });
  const answer = await answerWithDocumentContext(
    input.question,
    history.map(message => ({ role: message.role, content: message.content })),
  );
  await addConversationMessage({
    conversationId: conversation.id,
    role: "assistant",
    content: answer.answer,
    sources: answer.sources,
  });
  return { conversationId: conversation.id, ...answer };
}

export async function getChatHistory(conversationId: number, userId: number, visitorId: string) {
  return listConversationMessages(conversationId, userId, visitorId);
}
