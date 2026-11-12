import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
const repository = vi.hoisted(() => ({ completeDocumentIndexing: vi.fn(), failDocumentIndexing: vi.fn() }));
vi.mock("../repositories/document.repository", () => repository);
import { indexKnowledgeBundle } from "./document-indexing.service";

afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });
it("indexes exactly one complete chunk per curated block without an AI or network call", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const data = readFileSync(new URL("../../knowledge-packages/bradesco/Bradesco_PME_Seguro_Viagem_Schengen_Exterior.knowledge.json", import.meta.url));
  await indexKnowledgeBundle(10, data);
  const [id, count, chunks] = repository.completeDocumentIndexing.mock.calls[0]!;
  expect(id).toBe(10);
  expect(count).toBe(38);
  expect(chunks).toHaveLength(38);
  expect(chunks.every((chunk: { content: string }) => chunk.content.includes("Fontes originais:") && chunk.content.includes("Planos / versões:"))).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
});
it("does not publish chunks when source references are invalid", async () => {
  await expect(indexKnowledgeBundle(11, Buffer.from('{"schemaVersion":1}'))).rejects.toThrow();
  expect(repository.completeDocumentIndexing).not.toHaveBeenCalled();
  expect(repository.failDocumentIndexing).toHaveBeenCalledWith(11, expect.any(String));
});
