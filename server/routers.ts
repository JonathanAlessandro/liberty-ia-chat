import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { adminRouter } from "./routes/admin.routes";
import { adminAuthRouter } from "./routes/admin-auth.routes";
import { adminUsersRouter } from "./routes/admin-users.routes";
import { chatRouter } from "./routes/chat.routes";
import { userAuthRouter } from "./routes/user-auth.routes";
import { getLocalAdminCookieOptions, LOCAL_ADMIN_COOKIE } from "./middlewares/local-admin-auth.middleware";
import { getLocalUserCookieOptions, LOCAL_USER_COOKIE, logoutLocalUser } from "./services/local-user-auth.service";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      await logoutLocalUser(ctx.req);
      ctx.res.clearCookie(LOCAL_USER_COOKIE, { ...getLocalUserCookieOptions(ctx.req), maxAge: -1 });
      ctx.res.clearCookie(LOCAL_ADMIN_COOKIE, { ...getLocalAdminCookieOptions(ctx.req), maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  admin: adminRouter,
  adminAuth: adminAuthRouter,
  adminUsers: adminUsersRouter,
  userAuth: userAuthRouter,
  chat: chatRouter,
});

export type AppRouter = typeof appRouter;
