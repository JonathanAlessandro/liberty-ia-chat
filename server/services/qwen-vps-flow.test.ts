/** Opt-in offline integration: real application services, saved corpus, Qwen only. */
import fs from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const repository = vi.hoisted(() => ({
  getAiConfiguration: vi.fn(),
  listChatDocumentCatalog: vi.fn(),
  listReadyPageChunks: vi.fn(),
  listReadyDocumentChunks: vi.fn(),
  searchReadyChunksWithDocuments: vi.fn(),
  listReadyRegisteredWebDocuments: vi.fn(),
}));
vi.mock("../repositories/document.repository", () => repository);
vi.mock("./external-search.service", () => ({
  crawlExternalEvidence: () => {
    throw Error("External research is disabled in this test");
  },
  verifyResearchEvidence: () => {
    throw Error("External research is disabled in this test");
  },
}));
import { answerWithDocumentContext } from "./chat-context.service";

const enabled = process.env.RUN_QWEN_VPS_FLOW === "1";
describe.skipIf(!enabled)("VPS flow with local corpus and Qwen", () => {
  const originalEnv={...process.env};
  afterAll(()=>{process.env={...originalEnv};vi.unstubAllGlobals();});
  const results: unknown[] = [];
  let calls = 0;
  beforeAll(() => {
    const corpus = JSON.parse(fs.readFileSync("tmp/corpus-vps.json", "utf8"));
    const docs = corpus.documents.filter(
      (d: any) => d.isActive === 1 && d.status === "ready"
    );
    const by = new Map(docs.map((d: any) => [d.id, d]));
    const chunks = corpus.chunks
      .filter((c: any) => by.has(c.documentId))
      .map((c: any) => {
        const d: any = by.get(c.documentId);
        return {
          ...c,
          chunkId: c.id,
          documentName: d.originalName,
          sourceKind: d.sourceKind,
          sourceGroup: d.sourceGroup,
          sourceAuthority: d.sourceAuthority,
          effectiveAt: d.effectiveAt ? new Date(d.effectiveAt) : null,
          storageKey: d.storageKey,
        };
      });
    repository.listChatDocumentCatalog.mockResolvedValue(
      docs.map((d: any) => ({
        id: d.id,
        name: d.originalName,
        group: d.sourceGroup,
        kind: d.sourceKind,
      }))
    );
    repository.searchReadyChunksWithDocuments.mockImplementation(
      async (_needles: any, _limit: any, ids: number[] | undefined) =>
        chunks.filter((c: any) => !ids || ids.includes(c.documentId))
    );
    repository.listReadyDocumentChunks.mockImplementation(async (id: number) =>
      chunks.filter((c: any) => c.documentId === id)
    );
    repository.listReadyPageChunks.mockImplementation(async (pages: any[]) =>
      chunks.filter((c: any) =>
        pages.some(
          p => p.documentId === c.documentId && p.pageStart === c.pageStart
        )
      )
    );
    repository.listReadyRegisteredWebDocuments.mockResolvedValue([]);
    repository.getAiConfiguration.mockResolvedValue({
      systemPrompt:
        "Responda em português, de forma objetiva e fiel às fontes.",
    });
    process.env.LLM_BASE_URL = "http://127.0.0.1:8766/v1";
    process.env.LLM_API_KEY = "local-test-no-secret";
    process.env.LLM_MODEL = "liberty-qwen3.5-4b-local";
    process.env.LLM_TIMEOUT_MS = "360000";
    process.env.LLM_WEB_SEARCH_ENABLED = "false";
    const nativeFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (url: any, options: any) => {
      if (String(url) !== "http://127.0.0.1:8766/v1/chat/completions")
        throw Error("Only local Qwen completions are allowed");
      calls++;
      const body = JSON.parse(options.body);
      // Adapt only the model's chat format: Qwen accepts one initial system turn.
      body.messages = [
        {
          role: "system",
          content: body.messages
            .filter((m: any) => m.role === "system")
            .map((m: any) => m.content)
            .join("\n\n"),
        },
        ...body.messages.filter((m: any) => m.role !== "system"),
      ];
      body.max_tokens = body.max_completion_tokens;
      delete body.max_completion_tokens;
      body.chat_template_kwargs = { enable_thinking: false };
      return nativeFetch(url, { ...options, body: JSON.stringify(body) });
    });
  });
  it.each([
    [
      "Na Ameplan PME, com 66 anos ainda dá para comprar carência?",
      "ultrapassado",
    ],
    [
      "Um funcionário de 60 anos consegue comprar carência na Unimed Guarulhos?",
      "ultrapassado",
    ],
    [
      "No Bradesco Nacional Plus, quanto cobre dentista de urgência numa viagem aos Estados Unidos?",
      "USD 1.000",
    ],
    [
      "No Bradesco Nacional Plus quanto cobre dentista de urgência?",
      "USD 1.000",
    ],
    [
      "Na Ameplan PME, qual a carência de parto e doenças preexistentes nas tabelas 01 a 05?",
      "300 dias",
    ],
    ["Na Alice PME, qual o mínimo de vidas para contratar?", "01"],
    ["No MedSênior individual PF, qual a idade mínima do titular?", "44"],
    [
      "Na Alice, os boletos e a carteirinha são físicos ou digitais?",
      "digitais",
    ],
  ])(
    "%s",
    async (question, expected) => {
      const before = calls;
      const result = await answerWithDocumentContext(question);
      results.push({ question, result, localModelCalls: calls - before });
      fs.mkdirSync("tmp/vps-improvements-2026-11-16", { recursive: true });
      fs.writeFileSync(
        process.env.QWEN_FLOW_OUTPUT || "tmp/vps-improvements-2026-11-16/qwen-flow.json",
        JSON.stringify(
          {
            externalRequests: 0,
            localModelCalls: calls,
            repository: "historical corpus (database replaced only)",
            cases: results,
          },
          null,
          2
        )
      );
      expect(result.answer).toContain(expected);
      if (question.includes("dentista"))
        expect(result.answer).not.toContain("um acionamento por viagem");
    },
    600000
  );
});
