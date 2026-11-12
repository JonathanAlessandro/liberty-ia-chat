import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { knowledgeBundleChunks, parseKnowledgeBundle } from "./knowledge-bundle";
import { decodeAndValidateAdminFile } from "../middlewares/document-upload.middleware";
import { isSupportedKnowledgeFile } from "./knowledge-ingestion.service";
import { resolveDocumentScope } from "./chat-retrieval";
import { selectRelevantContext } from "./chat-context.service";

const name = "Bradesco_PME_Seguro_Viagem_Schengen_Exterior.knowledge.json";
const buffer = readFileSync(new URL(`../../knowledge-packages/bradesco/${name}`, import.meta.url));
const bundle = parseKnowledgeBundle(buffer);

it("imports the consolidated base through admin and monitored folder without accepting arbitrary JSON", () => {
  expect(decodeAndValidateAdminFile(buffer.toString("base64"), name)).toMatchObject({ kind: "knowledge", mimeType: "application/json" });
  expect(isSupportedKnowledgeFile(`/bradesco/${name}`)).toBe(true);
  expect(isSupportedKnowledgeFile("/bradesco/config.json")).toBe(false);
  expect(() => decodeAndValidateAdminFile(buffer.toString("base64"), "config.json")).toThrow();
});
it("keeps every full fact with its scope and original source pages in a single chunk", () => {
  const chunks = knowledgeBundleChunks(bundle);
  expect(chunks).toHaveLength(38);
  chunks.forEach((chunk, index) => {
    expect(chunk.content).toContain(bundle.blocks[index]!.content);
    expect(chunk.content).toContain("Planos / versões:");
    expect(chunk.content).toContain("Fontes originais:");
    expect(chunk.content).toContain("esta data não é vigência contratual");
    expect(chunk.pageStart).toBe(index + 1);
  });
  expect(bundle.effectiveAt).toBeNull();
});
it("rejects missing references, invented pages, duplicate IDs and malformed data before indexing", () => {
  for (const mutate of [
    (b: typeof bundle) => { b.blocks[0]!.references[0]!.sourceId = "inexistente"; },
    (b: typeof bundle) => { b.blocks[0]!.references[0]!.pages = [9999]; },
    (b: typeof bundle) => { b.blocks[1]!.id = b.blocks[0]!.id; },
    (b: typeof bundle) => { b.sources[1]!.id = b.sources[0]!.id; },
  ]) {
    const copy = structuredClone(bundle); mutate(copy);
    expect(() => parseKnowledgeBundle(Buffer.from(JSON.stringify(copy)))).toThrow();
  }
  expect(() => decodeAndValidateAdminFile(Buffer.from('{"bad":true}').toString("base64"), name)).toThrow("Base consolidada inválida");
});
it("does not replace the general Bradesco manual for unrelated questions", () => {
  const catalog = [{ id: 1, name: "Painel_bradesco-pme.pdf", group: "bradesco", kind: "pdf" }, { id: 2, name, group: "bradesco", kind: "knowledge" }];
  expect(resolveDocumentScope("Bradesco PME: carência de parto?", [], catalog).documentIds).toEqual([1]);
  expect(resolveDocumentScope("Bradesco PME: seguro viagem cobre Schengen?", [], catalog).documentIds).toEqual([2]);
  const mixedCase = [catalog[0]!, { ...catalog[1]!, group: "Bradesco" }];
  expect(resolveDocumentScope("Bradesco PME: seguro viagem cobre Schengen?", [], mixedCase).documentIds).toEqual([2]);
  expect(resolveDocumentScope("Bradesco PME: carência de parto?", [], mixedCase).documentIds).toEqual([1]);
  expect(resolveDocumentScope("Como funcionam as assistências em viagens Bradesco PME?", [], catalog).documentIds).toContain(2);
  expect(resolveDocumentScope("Seguro saúde Bradesco PME tem carência de parto?", [], catalog).documentIds).toEqual([1]);
});
it.each([
  ["No Bradesco Nacional, viagem Schengen a partir de julho 2022?", "nacional-novo-schengen"],
  ["No Bradesco, seguro viagem permite exatamente 90 dias?", "duracao-viagem"],
  ["Qual reembolso de hospedagem após alta hospitalar em viagem Bradesco?", "reembolso-hospedagem"],
])("retrieves a self-contained block for %s without calling an AI API", (question, id) => {
  const chunks = knowledgeBundleChunks(bundle).map((chunk, index) => ({ ...chunk, chunkId: index + 1, documentId: 1, documentName: name, sourceKind: "knowledge", sourceAuthority: "internal_training" as const, sourceGroup: "bradesco", effectiveAt: null, storageKey: name }));
  const selected = selectRelevantContext(question, chunks);
  expect(selected.some(chunk => chunk.content.includes(`[${id}]`))).toBe(true);
});
