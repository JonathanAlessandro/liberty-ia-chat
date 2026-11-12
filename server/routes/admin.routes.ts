import { z } from "zod";
import {
  changeAdminDocumentActive,
  deleteAdminDocument,
  getAdminAiConfiguration,
  listAdminDocuments,
  saveAdminAiConfiguration,
  uploadAdminDocument,
  listAdminKnowledgeFolders,
  createAdminKnowledgeFolder,
  renameAdminKnowledgeFolder,
  moveAdminDocument,
  reindexAdminDocuments,
} from "../controllers/admin.controller";
import { adminProcedure, router } from "../_core/trpc";

export const adminRouter = router({
  documents: adminProcedure.query(() => listAdminDocuments()),
  knowledgeFolders: adminProcedure.query(() => listAdminKnowledgeFolders()),
  createKnowledgeFolder: adminProcedure
    .input(z.object({ name: z.string().trim().min(2).max(80) }))
    .mutation(({ input, ctx }) => createAdminKnowledgeFolder(input.name, ctx.user.id)),
  renameKnowledgeFolder: adminProcedure
    .input(z.object({ folderId: z.number().int().positive(), name: z.string().trim().min(2).max(80) }))
    .mutation(({ input }) => renameAdminKnowledgeFolder(input.folderId, input.name)),
  uploadDocument: adminProcedure
    .input(
      z.object({
        replaceDocumentIds: z.array(z.number().int().positive()).max(100).optional(),
        fileName: z.string().min(1).max(255),
        mimeType: z.string(),
        base64Content: z.string().min(10),
        folderId: z.number().int().positive().optional(),
      }),
    )
    .mutation(({ input, ctx }) => uploadAdminDocument({ ...input, userId: ctx.user.id })),
  setDocumentActive: adminProcedure
    .input(z.object({ documentId: z.number().int().positive(), active: z.boolean() }))
    .mutation(({ input }) => changeAdminDocumentActive(input.documentId, input.active)),
  removeDocument: adminProcedure
    .input(z.object({ documentId: z.number().int().positive() }))
    .mutation(({ input }) => deleteAdminDocument(input.documentId)),
  moveDocument: adminProcedure
    .input(z.object({ documentId: z.number().int().positive(), folderId: z.number().int().positive().optional() }))
    .mutation(({ input }) => moveAdminDocument(input.documentId, input.folderId)),
  reindexDocuments: adminProcedure.mutation(() => reindexAdminDocuments()),
  aiConfiguration: adminProcedure.query(() => getAdminAiConfiguration()),
  saveAiConfiguration: adminProcedure
    .input(z.object({ systemPrompt: z.string().trim().min(40).max(8000) }))
    .mutation(({ input, ctx }) => saveAdminAiConfiguration(input.systemPrompt, ctx.user.id)),
});
