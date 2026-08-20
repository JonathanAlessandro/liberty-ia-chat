import { beforeEach, describe, expect, it, vi } from "vitest";

const watcherState = vi.hoisted(() => ({ handlers: new Map<string, (path: string) => void>(), on: vi.fn(), watch: vi.fn() }));
const fileSystem = vi.hoisted(() => ({ mkdir: vi.fn() }));
const ingestion = vi.hoisted(() => ({ ingestKnowledgeFile: vi.fn(), isSupportedKnowledgeFile: vi.fn(), removeKnowledgeFile: vi.fn() }));

vi.mock("chokidar", () => ({
  default: {
    watch: watcherState.watch.mockImplementation(() => ({
      on: (event: string, handler: (path: string) => void) => {
        watcherState.handlers.set(event, handler);
        return { on: watcherState.on };
      },
    })),
  },
}));
vi.mock("node:fs/promises", () => fileSystem);
vi.mock("./knowledge-ingestion.service", () => ingestion);

import { startKnowledgeWatcher, waitForKnowledgeQueue } from "./knowledge-watcher.service";
import path from "node:path";

describe("knowledge folder watcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    watcherState.handlers.clear();
    fileSystem.mkdir.mockResolvedValue(undefined);
    ingestion.isSupportedKnowledgeFile.mockReturnValue(true);
    ingestion.ingestKnowledgeFile.mockResolvedValue({ action: "added" });
    ingestion.removeKnowledgeFile.mockResolvedValue(undefined);
    process.env.KNOWLEDGE_DIR = "/data/liberty-ai/knowledge";
    process.env.NODE_ENV = "test";
  });

  it("serializes add, change and removal events against the monitored folder", async () => {
    await startKnowledgeWatcher();
    const filePath = "/data/liberty-ai/knowledge/produtos/cobertura.xlsx";

    watcherState.handlers.get("add")?.(filePath);
    await waitForKnowledgeQueue();
    watcherState.handlers.get("change")?.(filePath);
    await waitForKnowledgeQueue();
    watcherState.handlers.get("unlink")?.(filePath);
    await waitForKnowledgeQueue();

    expect(ingestion.ingestKnowledgeFile).toHaveBeenNthCalledWith(1, "/data/liberty-ai/knowledge", filePath);
    expect(ingestion.ingestKnowledgeFile).toHaveBeenNthCalledWith(2, "/data/liberty-ai/knowledge", filePath);
    expect(ingestion.removeKnowledgeFile).toHaveBeenCalledWith("/data/liberty-ai/knowledge", filePath);
  });

  it("reports the result of a fontes.txt import", async () => {
    ingestion.ingestKnowledgeFile.mockResolvedValue({
      action: "url-list",
      results: [
        { url: "https://operadora.example/produtos", status: "indexed" },
        { url: "https://operadora.example/rede", status: "unchanged" },
        { url: "https://operadora.example/bloqueada", status: "failed", error: "A página retornou HTTP 403." },
      ],
    });
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await startKnowledgeWatcher();

    watcherState.handlers.get("change")?.("/data/liberty-ai/knowledge/fontes.txt");
    await waitForKnowledgeQueue();

    expect(info).toHaveBeenCalledWith("[Knowledge folder] fontes.txt processado: 1 indexada(s), 1 inalterada(s), 1 falha(s).");
    expect(warn).toHaveBeenCalledWith("[Knowledge folder] Fonte não indexada: https://operadora.example/bloqueada — A página retornou HTTP 403.");
  });

  it("creates and monitors a root knowledge folder automatically in development", async () => {
    delete process.env.KNOWLEDGE_DIR;
    process.env.NODE_ENV = "development";

    await startKnowledgeWatcher();

    const expectedDirectory = path.resolve(process.cwd(), "knowledge");
    expect(fileSystem.mkdir).toHaveBeenCalledWith(expectedDirectory, { recursive: true });
  });

  it("uses moderated polling in production for mounted Docker volumes", async () => {
    process.env.NODE_ENV = "production";

    await startKnowledgeWatcher();

    expect(watcherState.watch).toHaveBeenCalledWith("/data/liberty-ai/knowledge", expect.objectContaining({ usePolling: true, interval: 1500, binaryInterval: 3000 }));
  });
});
