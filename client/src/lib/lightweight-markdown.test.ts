import { describe, expect, it } from "vitest";
import { parseLightweightMarkdown } from "./lightweight-markdown";

describe("parseLightweightMarkdown", () => {
  it("preserves bold text, safe links and inline code", () => {
    expect(parseLightweightMarkdown("Use **documentos** em [Fonte](https://example.com) e `código`." )[0]).toEqual({
      type: "paragraph",
      lines: [[
        { type: "text", value: "Use " },
        { type: "bold", value: "documentos" },
        { type: "text", value: " em " },
        { type: "link", label: "Fonte", href: "https://example.com" },
        { type: "text", value: " e " },
        { type: "code", value: "código" },
        { type: "text", value: "." },
      ]],
    });
  });

  it("converts ordered and unordered markdown lists into structured blocks", () => {
    const blocks = parseLightweightMarkdown("- Primeiro\n- Segundo\n\n1. Um\n2. Dois");
    expect(blocks.map((block) => block.type)).toEqual(["unordered-list", "ordered-list"]);
  });
});
