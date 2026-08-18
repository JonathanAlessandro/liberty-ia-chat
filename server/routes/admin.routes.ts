import { z } from "zod";
import {
  deleteAdminDocument,
  getAdminAiConfiguration,
  listAdminDocuments,
  saveAdminAiConfiguration,
  uploadAdminDocument,
} from "../controllers/admin.controller";
import { adminProcedure, router } from "../_core/trpc";

const documentId = z.number().int().positive();

export const adminRouter = router({
  documents: adminProcedure.query(() => listAdminDocuments()),
  aiConfiguration: adminProcedure.query(() => getAdminAiConfiguration()),
  uploadDocument: adminProcedure
    .input(
      z.object({
        fileName: z.string().trim().min(1).max(255),
        mimeType: z.string().refine(value => value === "application/pdf", "O arquivo deve ser um PDF."),
        base64Content: z.string().min(1).max(21_000_000),
      }),
    )
    .mutation(({ input, ctx }) => uploadAdminDocument(input, ctx.user.id)),
  removeDocument: adminProcedure
    .input(z.object({ documentId }))
    .mutation(({ input }) => deleteAdminDocument(input.documentId)),
  saveAiConfiguration: adminProcedure
    .input(z.object({ systemPrompt: z.string().trim().min(40).max(8000) }))
    .mutation(({ input, ctx }) => saveAdminAiConfiguration(input.systemPrompt, ctx.user.id)),
});
