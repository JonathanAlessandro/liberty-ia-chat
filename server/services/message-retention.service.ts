/** Chat history is permanent. Explicit user deletion remains available. */
export const MESSAGE_RETENTION_DAYS = null;
export async function cleanExpiredMessages(now = new Date()) {
  return { removed: 0, cutoff: now };
}
/** Backward-compatible no-op: never schedule automatic history deletion. */
export function startMessageRetentionCleanup() {}
