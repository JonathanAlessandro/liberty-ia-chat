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

function enqueue(task: () => Promise<void>) {
  ingestionQueue = ingestionQueue
    .then(task)
    .catch(error => console.error("[Knowledge folder]", error instanceof Error ? error.message : error));
  return ingestionQueue;
}

export async function startKnowledgeWatcher() {
  const rootDir = resolveKnowledgeDirectory();
  if (!rootDir) {
    console.info("[Knowledge folder] Monitoramento desativado: KNOWLEDGE_DIR não configurado.");
    return;
  }

  const resolvedRoot = path.resolve(rootDir);
  await mkdir(resolvedRoot, { recursive: true });
  const watcher = chokidar.watch(resolvedRoot, {
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 1800, pollInterval: 250 },
    ignored: (filePath, details) => {
      const hidden = path.basename(filePath).startsWith(".");
      if (details?.isDirectory()) return hidden;
      return hidden || !isSupportedKnowledgeFile(filePath);
    },
  });

  watcher.on("add", filePath => void enqueue(async () => { await ingestKnowledgeFile(resolvedRoot, filePath); }));
  watcher.on("change", filePath => void enqueue(async () => { await ingestKnowledgeFile(resolvedRoot, filePath); }));
  watcher.on("unlink", filePath => void enqueue(async () => { await removeKnowledgeFile(resolvedRoot, filePath); }));
  watcher.on("error", error => console.error("[Knowledge folder] Erro no monitoramento:", error instanceof Error ? error.message : error));
  const automaticLocalDirectory = !process.env.KNOWLEDGE_DIR && process.env.NODE_ENV === "development";
  console.info(`[Knowledge folder] Monitorando ${resolvedRoot} para PDFs, imagens e planilhas${automaticLocalDirectory ? " (pasta local criada automaticamente)" : ""}.`);
}
