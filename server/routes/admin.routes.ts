import { z } from "zod";
import {
  deleteAdminDocument,
  getAdminAiConfiguration,
  listAdminDocuments,
  saveAdminAiConfiguration,
  uploadAdminDocument,
} from "../controllers/admin.controller";
import { adminProcedure, router } from "../_core/trpc";

export const adminRouter = router({
  documents: adminProcedure.query(() => listAdminDocuments()),
  uploadDocument: adminProcedure
    .input(
      z.object({
        fileName: z.string().min(1).max(255),
        mimeType: z.string(),
        base64Content: z.string().min(10),
      }),
    )
    .mutation(({ input, ctx }) => uploadAdminDocument({ ...input, userId: ctx.user.id })),
  removeDocument: adminProcedure
    .input(z.object({ documentId: z.number().int().positive() }))
    .mutation(({ input }) => deleteAdminDocument(input.documentId)),
  aiConfiguration: adminProcedure.query(() => getAdminAiConfiguration()),
  saveAiConfiguration: adminProcedure
    .input(z.object({ systemPrompt: z.string().trim().min(40).max(8000) }))
    .mutation(({ input, ctx }) => saveAdminAiConfiguration(input.systemPrompt, ctx.user.id)),
});
