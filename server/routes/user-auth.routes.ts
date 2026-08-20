import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { localUserProcedure, publicProcedure, router } from "../_core/trpc";
import { authenticateLocalUser, changeLocalUserPassword, createUserSession, getLocalUserCookieOptions, LOCAL_USER_COOKIE, logoutLocalUser } from "../services/local-user-auth.service";

const passwordSchema = z.string().min(10, "A senha precisa ter pelo menos 10 caracteres.").max(256);

export const userAuthRouter = router({
  me: publicProcedure.query(({ ctx }) => ctx.localUser ? { id: ctx.localUser.id, name: ctx.localUser.name, email: ctx.localUser.email, role: ctx.localUser.role, mustChangePassword: ctx.localUser.mustChangePassword === true } : null),
  login: publicProcedure.input(z.object({ email: z.string().email().max(320), password: z.string().min(1).max(256) })).mutation(async ({ input, ctx }) => {
    const entry = await authenticateLocalUser(input.email, input.password);
    if (!entry) throw new TRPCError({ code: "UNAUTHORIZED", message: "E-mail ou senha inválidos, ou conta desativada." });
    const token = await createUserSession(entry.user.id);
    ctx.res.cookie(LOCAL_USER_COOKIE, token, getLocalUserCookieOptions(ctx.req));
    return { success: true, mustChangePassword: entry.account.mustChangePassword === 1 } as const;
  }),
  logout: publicProcedure.mutation(async ({ ctx }) => {
    await logoutLocalUser(ctx.req);
    ctx.res.clearCookie(LOCAL_USER_COOKIE, { ...getLocalUserCookieOptions(ctx.req), maxAge: -1 });
    return { success: true } as const;
  }),
  changePassword: localUserProcedure.input(z.object({ currentPassword: z.string().min(1).max(256), nextPassword: passwordSchema })).mutation(async ({ input, ctx }) => {
    const changed = await changeLocalUserPassword(ctx.user.id, input.currentPassword, input.nextPassword);
    if (!changed) throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha atual inválida." });
    const token = await createUserSession(ctx.user.id);
    ctx.res.cookie(LOCAL_USER_COOKIE, token, getLocalUserCookieOptions(ctx.req));
    return { success: true } as const;
  }),
});
