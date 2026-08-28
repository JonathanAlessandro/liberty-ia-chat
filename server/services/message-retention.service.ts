import { deleteMessagesOlderThan } from "../repositories/conversation.repository";

export const MESSAGE_RETENTION_DAYS = 7;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
let cleanupTimer: NodeJS.Timeout | null = null;

export async function cleanExpiredMessages(now = new Date()) {
  const cutoff = new Date(now.getTime() - MESSAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const removed = await deleteMessagesOlderThan(cutoff);
  if (removed > 0) console.info(`[Message retention] ${removed} mensagem(ns) anterior(es) a ${cutoff.toISOString()} removida(s).`);
  return { removed, cutoff };
}

async function runSafely() {
  try {
    await cleanExpiredMessages();
  } catch (error) {
    console.error("[Message retention] Não foi possível limpar mensagens expiradas:", error);
  }
}

export function startMessageRetentionCleanup() {
  if (cleanupTimer) return;
  void runSafely();
  cleanupTimer = setInterval(() => void runSafely(), CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();
}
