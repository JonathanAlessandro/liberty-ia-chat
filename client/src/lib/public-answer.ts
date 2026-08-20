import type { ChatSource } from "./chat-history";

export const SHOW_PUBLIC_SOURCE_METADATA = false;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeSourceSection(value: string) {
  return value.replace(
    /(?:\n|^)\s*(?:#{1,6}\s*)?(?:fontes?|refer[eê]ncias?|origens?|fontes?\s+identificadas?|fontes?\s+consultadas?)\s*(?:\([^\n)]*\))?\s*:?\s*(?:\n[\s\S]*)?$/i,
    "",
  );
}

/** Removes user-facing provenance while retaining the answer itself. */
export function sanitizePublicAnswer(content: string, sources: ChatSource[] = []) {
  let sanitized = removeSourceSection(content)
    .replace(/\[([^\]]+)\]\(https?:\/\/[^\s)]+\)/gi, "$1")
    .replace(/\bhttps?:\/\/[^\s)\]}>,]+/gi, "")
    .replace(/\s*\((?:fonte|refer[eê]ncia|origem)\s*:[^)]*\)/gi, "")
    .replace(/\s*\[(?:fonte|refer[eê]ncia|origem)[^\]]*\]/gi, "");

  for (const source of sources) {
    if (source.type === "document") {
      sanitized = sanitized.replace(new RegExp(`\\s*\\(?${escapeRegExp(source.documentName)}(?:\\s*[—–-]\\s*(?:p[aá]gina|p\\.)\\s*\\d+(?:\\s*(?:a|–|-)\\s*\\d+)?)?\\)?`, "gi"), "");
      continue;
    }
    sanitized = sanitized
      .replace(new RegExp(`\\s*\\(?${escapeRegExp(source.title)}\\)?`, "gi"), "")
      .replace(new RegExp(`\\s*\\(?${escapeRegExp(source.domain)}\\)?`, "gi"), "");
  }

  return sanitized
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ {2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([.!?])\1+/g, "$1")
    .trim();
}
