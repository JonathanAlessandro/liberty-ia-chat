import { expect, it, vi } from "vitest";
vi.mock("node:fs/promises", () => ({ stat: async () => ({ isFile: () => true, size: 20 }), readFile: async () => Buffer.from("changed old file") }));
const stored = vi.hoisted(() => vi.fn());
vi.mock("./document-storage.service", () => ({ fingerprintBuffer: () => "changed", storeKnowledgeAsset: stored }));
vi.mock("../repositories/document.repository", () => ({ getDocumentBySourcePath: async () => ({ id: 2, isActive: 0, status: "ready", sourceFingerprint: "old" }) }));
import { ingestKnowledgeFile } from "./knowledge-ingestion.service";
it("keeps a retired monitored source inactive even when its content changes", async () => {
  const result = await ingestKnowledgeFile(process.cwd(), `${process.cwd()}/old.pdf`);
  expect(result).toMatchObject({ action: "unchanged", document: { isActive: 0 } });
  expect(stored).not.toHaveBeenCalled();
});
