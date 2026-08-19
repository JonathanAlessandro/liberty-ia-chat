import { z } from "zod";
import { askChatQuestion, getChatHistory } from "../controllers/chat.controller";
import { protectedProcedure, router } from "../_core/trpc";

const visitorId = z.string().uuid();

export const chatRouter = router({
  ask: protectedProcedure
    .input(
      z.object({
        visitorId,
        conversationId: z.number().int().positive().optional(),
        question: z.string().trim().min(2).max(2200),
      }),
    )
    .mutation(({ input, ctx }) => askChatQuestion({ ...input, userId: ctx.user.id })),
  history: protectedProcedure
    .input(z.object({ visitorId, conversationId: z.number().int().positive() }))
    .query(({ input, ctx }) => getChatHistory(input.conversationId, ctx.user.id, input.visitorId)),
});
