import { describe, expect, it } from "vitest";
import { createVisitorId, describeChatSource, hydrateStoredMessages, parseSavedConversationId } from "./chat-history";

describe("chat history hydration", () => {
  it("restores only valid identifiers saved in the browser", () => {
    expect(parseSavedConversationId("42")).toBe(42);
    expect(parseSavedConversationId("0")).toBeUndefined();
    expect(parseSavedConversationId("not-a-number")).toBeUndefined();
  });

  it("uses a standards-compliant fallback when randomUUID is unavailable", () => {
    const generated = createVisitorId({
      getRandomValues: bytes => {
        bytes.fill(0);
        return bytes;
      },
    });

    expect(generated).toBe("00000000-0000-4000-8000-000000000000");
  });

  it("prefers the browser randomUUID implementation when it exists", () => {
    expect(createVisitorId({ getRandomValues: bytes => bytes, randomUUID: () => "browser-uuid" })).toBe("browser-uuid");
  });

  it("hydrates persisted messages and preserves only well-formed source references", () => {
    const restored = hydrateStoredMessages([
      { role: "user", content: "Qual é o prazo?", sourcesJson: null },
      {
        role: "assistant",
        content: "O prazo é de 30 dias.",
        sourcesJson: JSON.stringify([
          { type: "document", documentName: "Guia.pdf", pageStart: 2, pageEnd: 2 },
          { type: "external", title: "Órgão oficial", url: "https://example.org/prazo", domain: "example.org" },
          { documentName: 4, pageStart: "x", pageEnd: 2 },
        ]),
      },
    ]);

    expect(restored).toEqual([
      { role: "user", content: "Qual é o prazo?", sources: [] },
      {
        role: "assistant",
        content: "O prazo é de 30 dias.",
        sources: [
          { type: "document", documentName: "Guia.pdf", pageStart: 2, pageEnd: 2 },
          { type: "external", title: "Órgão oficial", url: "https://example.org/prazo", domain: "example.org" },
        ],
      },
    ]);
  });

  it("labels document and external references differently in restored messages", () => {
    expect(describeChatSource({ type: "document", documentName: "Guia.pdf", pageStart: 4, pageEnd: 6 })).toBe("PDF · Guia.pdf · p. 4–6");
    expect(describeChatSource({ type: "external", title: "Órgão oficial", url: "https://example.org", domain: "example.org" })).toBe("Web · example.org");
  });
});
