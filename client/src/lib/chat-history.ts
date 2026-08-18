export type ChatSource =
  | { type: "document"; documentName: string; pageStart: number; pageEnd: number }
  | { type: "external"; title: string; url: string; domain: string };

export type StoredChatMessage = {
  role: "user" | "assistant";
  content: string;
  sourcesJson: string | null;
};

export function parseSavedConversationId(value: string | null) {
  const saved = Number(value);
  return Number.isSafeInteger(saved) && saved > 0 ? saved : undefined;
}

export function parseStoredSources(value: string | null): ChatSource[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is ChatSource => {
          if (!item || typeof item !== "object") return false;
          if (item.type === "document") {
            return typeof item.documentName === "string" && Number.isInteger(item.pageStart) && Number.isInteger(item.pageEnd);
          }
          return item.type === "external" && typeof item.title === "string" && typeof item.url === "string" && typeof item.domain === "string";
        })
      : [];
  } catch {
    return [];
  }
}

export function hydrateStoredMessages(messages: StoredChatMessage[]) {
  return messages.map(message => ({
    role: message.role,
    content: message.content,
    sources: parseStoredSources(message.sourcesJson),
  }));
}

export function describeChatSource(source: ChatSource) {
  return source.type === "document"
    ? `PDF · ${source.documentName} · p. ${source.pageStart}${source.pageEnd !== source.pageStart ? `–${source.pageEnd}` : ""}`
    : `Web · ${source.domain}`;
}
