export type ChatSource =
  | { type: "document"; documentName: string; pageStart: number; pageEnd: number }
  | { type: "external"; title: string; url: string; domain: string; origin?: "search" | "url-list" };

export type StoredChatMessage = {
  role: "user" | "assistant";
  content: string;
  sourcesJson: string | null;
};

type BrowserCrypto = Pick<Crypto, "getRandomValues"> & Partial<Pick<Crypto, "randomUUID">>;

function formatUuid(bytes: Uint8Array) {
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Produz um UUID v4 para separar conversas por navegador. randomUUID exige
 * contexto seguro em alguns navegadores; getRandomValues mantém a geração
 * criptográfica disponível em mais contextos, inclusive algumas prévias HTTP.
 */
export function createVisitorId(browserCrypto: BrowserCrypto | undefined = globalThis.crypto) {
  if (typeof browserCrypto?.randomUUID === "function") return browserCrypto.randomUUID();

  const bytes = new Uint8Array(16);
  if (browserCrypto?.getRandomValues) return formatUuid(browserCrypto.getRandomValues(bytes));

  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  return formatUuid(bytes);
}

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
          return item.type === "external" && typeof item.title === "string" && typeof item.url === "string" && typeof item.domain === "string" && (item.origin === undefined || item.origin === "search" || item.origin === "url-list");
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
    : `${source.origin === "url-list" ? "Lista de links" : "Web"} · ${source.domain}`;
}
