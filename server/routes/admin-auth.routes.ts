import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { authenticateLocalAdmin, createLocalAdminToken, getLocalAdminCookieOptions, LOCAL_ADMIN_COOKIE } from "../middlewares/local-admin-auth.middleware";
import { publicProcedure, router } from "../_core/trpc";

export const adminAuthRouter = router({
  login: publicProcedure
    .input(z.object({ email: z.string().email().max(320), password: z.string().min(1).max(256) }))
    .mutation(async ({ input, ctx }) => {
      let user;
      try {
        user = await authenticateLocalAdmin(input.email, input.password);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Não foi possível iniciar a sessão.";
        throw new TRPCError({ code: "PRECONDITION_FAILED", message });
      }
      if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "E-mail ou senha inválidos." });
      const token = await createLocalAdminToken(user.email ?? input.email);
      ctx.res.cookie(LOCAL_ADMIN_COOKIE, token, getLocalAdminCookieOptions(ctx.req));
      return { success: true } as const;
    }),
  logout: publicProcedure.mutation(({ ctx }) => {
    ctx.res.clearCookie(LOCAL_ADMIN_COOKIE, { ...getLocalAdminCookieOptions(ctx.req), maxAge: -1 });
    return { success: true } as const;
  }),
});
