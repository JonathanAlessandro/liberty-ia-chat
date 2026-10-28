import type { ChatSource } from "./chat-history";

export const SHOW_PUBLIC_SOURCE_METADATA = true;

/** Keep source dates, conflicts and clickable citations visible. Markdown renders text safely. */
export function sanitizePublicAnswer(content: string, _sources: ChatSource[] = []) {
  return content.trim();
}
