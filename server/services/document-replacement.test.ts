import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), register: vi.fn(), pdf: vi.fn(), bundle: vi.fn(), text: vi.fn() }));
vi.mock("../repositories/document.repository", () => ({ getDocumentById: mocks.get, failDocumentIndexing: vi.fn() }));
vi.mock("./document.service", () => ({ registerAdminDocument: mocks.register }));
vi.mock("./document-indexing.service", () => ({ indexPdfDocument: mocks.pdf, indexKnowledgeBundle: mocks.bundle, indexExtractedTextDocument: mocks.text }));
import { uploadAdminDocument } from "../controllers/admin.controller";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockImplementation(async id => ({ id, status: "ready" }));
  mocks.register.mockResolvedValue({ document: { id: 9 }, buffer: Buffer.from("data"), kind: "knowledge" });
  mocks.bundle.mockResolvedValue(undefined);
});
const input = { fileName: "new.knowledge.json", mimeType: "application/json", base64Content: "test", userId: 1, replaceDocumentIds: [2, 2, 3] };
describe("substituição explícita de bases", () => {
  it("passes only selected unique IDs to atomic indexing", async () => {
    await uploadAdminDocument(input);
    expect(mocks.bundle).toHaveBeenCalledWith(9, expect.any(Buffer), [2, 3]);
  });
  it("rejects missing old sources before storing the new upload", async () => {
    mocks.get.mockResolvedValue(null);
    await expect(uploadAdminDocument(input)).rejects.toThrow("não existe mais");
    expect(mocks.register).not.toHaveBeenCalled();
  });
  it("returns indexing failure without attempting a separate removal", async () => {
    mocks.bundle.mockRejectedValueOnce(new Error("failed"));
    mocks.get.mockImplementation(async id => ({ id, status: id === 9 ? "failed" : "ready" }));
    expect(await uploadAdminDocument(input)).toMatchObject({ id: 9, status: "failed" });
    expect(mocks.pdf).not.toHaveBeenCalled();
  });
});
