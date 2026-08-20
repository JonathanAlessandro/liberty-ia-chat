import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AIChatBox } from "./AIChatBox";

describe("AIChatBox", () => {
  it("renders an assistant answer without source metadata or links", () => {
    const markup = renderToStaticMarkup(
      <AIChatBox
        messages={[{
          role: "assistant",
          content: "A resposta encontrada é objetiva.\n\nFontes:\n- Tabela de preços 2026.pdf — página 8\n- https://example.com/precos",
          sources: [{ type: "document", documentName: "Tabela de preços 2026.pdf", pageStart: 8, pageEnd: 8 }],
        }]}
        onSendMessage={() => undefined}
        height="500px"
      />,
    );

    expect(markup).toContain("A resposta encontrada é objetiva.");
    expect(markup).not.toContain("Tabela de preços 2026.pdf");
    expect(markup).not.toContain("example.com/precos");
    expect(markup).not.toContain(">Fontes<");
  });
});
