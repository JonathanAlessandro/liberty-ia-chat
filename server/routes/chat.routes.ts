import { z } from "zod";
import { askChatQuestion, getChatHistory } from "../controllers/chat.controller";
import { publicProcedure, router } from "../_core/trpc";

const visitorId = z.string().uuid();

export const chatRouter = router({
  ask: publicProcedure
    .input(
      z.object({
        visitorId,
        conversationId: z.number().int().positive().optional(),
        question: z.string().trim().min(2).max(2200),
      }),
    )
    .mutation(({ input }) => askChatQuestion(input)),
  history: publicProcedure
    .input(z.object({ visitorId, conversationId: z.number().int().positive() }))
    .query(({ input }) => getChatHistory(input.conversationId, input.visitorId)),
});
