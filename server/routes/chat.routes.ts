import { z } from "zod";
import { askChatQuestion, deleteChatConversation, getChatHistory, getUserConversations } from "../controllers/chat.controller";
import { localUserProcedure, router } from "../_core/trpc";

const visitorId = z.string().uuid();

export const chatRouter = router({
  conversations: localUserProcedure
    .input(z.object({ visitorId }))
    .query(({ input, ctx }) => getUserConversations(ctx.user.id, input.visitorId)),
  ask: localUserProcedure
    .input(
      z.object({
        visitorId,
        conversationId: z.number().int().positive().optional(),
        question: z.string().trim().min(2).max(2200),
      }),
    )
    .mutation(({ input, ctx }) => askChatQuestion({ ...input, userId: ctx.user.id })),
  history: localUserProcedure
    .input(z.object({ visitorId, conversationId: z.number().int().positive() }))
    .query(({ input, ctx }) => getChatHistory(input.conversationId, ctx.user.id, input.visitorId)),
  delete: localUserProcedure
    .input(z.object({ visitorId, conversationId: z.number().int().positive() }))
    .mutation(({ input, ctx }) => deleteChatConversation(input.conversationId, ctx.user.id, input.visitorId)),
});
