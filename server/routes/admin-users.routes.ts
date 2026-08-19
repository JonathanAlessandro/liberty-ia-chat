import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { listLocalUsers, replaceLocalUserPassword, setLocalUserActive } from "../repositories/local-user.repository";
import { hashLocalPassword, registerLocalUser } from "../services/local-user-auth.service";

const userInput = z.object({ name: z.string().trim().min(2).max(120), email: z.string().email().max(320), temporaryPassword: z.string().min(10).max(256) });

export const adminUsersRouter = router({
  list: adminProcedure.query(() => listLocalUsers()),
  create: adminProcedure.input(userInput).mutation(async ({ input }) => {
    try {
      const created = await registerLocalUser({ name: input.name, email: input.email, password: input.temporaryPassword });
      if (!created) throw new Error("Não foi possível criar a conta.");
      return { id: created.user.id, email: created.user.email, name: created.user.name };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível criar a conta.";
      throw new TRPCError({ code: "CONFLICT", message });
    }
  }),
  setActive: adminProcedure.input(z.object({ userId: z.number().int().positive(), isActive: z.boolean() })).mutation(async ({ input, ctx }) => {
    if (input.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Não é permitido desativar a própria conta administrativa." });
    await setLocalUserActive(input.userId, input.isActive);
    return { success: true } as const;
  }),
  resetPassword: adminProcedure.input(z.object({ userId: z.number().int().positive(), temporaryPassword: z.string().min(10).max(256) })).mutation(async ({ input }) => {
    await replaceLocalUserPassword(input.userId, hashLocalPassword(input.temporaryPassword), true);
    return { success: true } as const;
  }),
});
