import { describe, expect, it } from "vitest";
import { sanitizePublicAnswer, SHOW_PUBLIC_SOURCE_METADATA } from "./public-answer";

describe("sanitizePublicAnswer", () => {
  it("hides a trailing sources section from persisted assistant content", () => {
    const answer = sanitizePublicAnswer("A carência encontrada é de 24 horas.\n\nFontes (identificadas):\n- Guia de carências.pdf — página 4\n- https://example.com/regra");

    expect(answer).toBe("A carência encontrada é de 24 horas.");
  });

  it("removes source URLs and registered metadata while preserving the answer", () => {
    const answer = sanitizePublicAnswer(
      "O prazo informado é de 30 dias (Fonte: https://example.com/reembolso). Guia de cobertura.pdf — página 4.",
      [{ type: "document", documentId: 7, documentName: "Guia de cobertura.pdf", pageStart: 4, pageEnd: 4 }],
    );

    expect(answer).toBe("O prazo informado é de 30 dias.");
  });

  it("removes a registered external source title and domain", () => {
    const answer = sanitizePublicAnswer(
      "A regra se aplica ao produto consultado. Portal oficial da operadora exemplo.com.br.",
      [{ type: "external", title: "Portal oficial da operadora", url: "https://exemplo.com.br/regra", domain: "exemplo.com.br" }],
    );

    expect(answer).toBe("A regra se aplica ao produto consultado.");
  });

  it("does not permit visible source metadata in the public chat", () => {
    expect(SHOW_PUBLIC_SOURCE_METADATA).toBe(false);
  });
});
