import chokidar from "chokidar";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { ingestKnowledgeFile, isSupportedKnowledgeFile, removeKnowledgeFile } from "./knowledge-ingestion.service";

let ingestionQueue: Promise<void> = Promise.resolve();

export function waitForKnowledgeQueue() {
  return ingestionQueue;
}

export function resolveKnowledgeDirectory() {
  const configuredDirectory = process.env.KNOWLEDGE_DIR?.trim();
  if (configuredDirectory) return configuredDirectory;
  if (process.env.NODE_ENV === "development") return path.resolve(process.cwd(), "knowledge");
  return null;
}

function shouldUseKnowledgePolling() {
  const configured = process.env.KNOWLEDGE_WATCH_POLLING?.trim().toLowerCase();
  if (configured) return configured !== "false" && configured !== "0";
  return process.env.NODE_ENV === "production";
}

function enqueue(task: () => Promise<void>) {
  ingestionQueue = ingestionQueue
    .then(task)
    .catch(error => console.error("[Knowledge folder]", error instanceof Error ? error.message : error));
  return ingestionQueue;
}

async function ingestAndReport(rootDir: string, filePath: string) {
  const result = await ingestKnowledgeFile(rootDir, filePath);
  if (result.action !== "url-list") return;

  const indexed = result.results.filter(item => item.status === "indexed").length;
  const unchanged = result.results.filter(item => item.status === "unchanged").length;
  const failed = result.results.filter(item => item.status === "failed");
  console.info(`[Knowledge folder] fontes.txt processado: ${indexed} indexada(s), ${unchanged} inalterada(s), ${failed.length} falha(s).`);
  for (const item of failed) console.warn(`[Knowledge folder] Fonte não indexada: ${item.url} — ${item.error ?? "Falha desconhecida."}`);
}

export async function startKnowledgeWatcher() {
  const rootDir = resolveKnowledgeDirectory();
  if (!rootDir) {
    console.info("[Knowledge folder] Monitoramento desativado: KNOWLEDGE_DIR não configurado.");
    return;
  }

  const resolvedRoot = path.resolve(rootDir);
  const usePolling = shouldUseKnowledgePolling();
  await mkdir(resolvedRoot, { recursive: true });
  const watcher = chokidar.watch(resolvedRoot, {
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 1800, pollInterval: 250 },
    usePolling,
    interval: 1500,
    binaryInterval: 3000,
    ignored: (filePath, details) => {
      const hidden = path.basename(filePath).startsWith(".");
      if (details?.isDirectory()) return hidden;
      return hidden || !isSupportedKnowledgeFile(filePath);
    },
  });

  watcher.on("add", filePath => void enqueue(async () => { await ingestAndReport(resolvedRoot, filePath); }));
  watcher.on("change", filePath => void enqueue(async () => { await ingestAndReport(resolvedRoot, filePath); }));
  watcher.on("unlink", filePath => void enqueue(async () => { await removeKnowledgeFile(resolvedRoot, filePath); }));
  watcher.on("error", error => console.error("[Knowledge folder] Erro no monitoramento:", error instanceof Error ? error.message : error));
  const automaticLocalDirectory = !process.env.KNOWLEDGE_DIR && process.env.NODE_ENV === "development";
  console.info(`[Knowledge folder] Monitorando ${resolvedRoot} para PDFs, imagens, planilhas e fontes.txt${usePolling ? " (polling ativo)" : ""}${automaticLocalDirectory ? " (pasta local criada automaticamente)" : ""}.`);
}
