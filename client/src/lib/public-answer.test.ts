import { describe, expect, it } from "vitest";
import { sanitizePublicAnswer, SHOW_PUBLIC_SOURCE_METADATA } from "./public-answer";
describe("public provenance", () => {
  it("preserves source links, dates and conflicts", () => {
    const text = "Painel: 30 dias, vigência 2025. ANS: regra geral diferente em 2026. [ANS](https://www.gov.br/ans/regra)";
    expect(sanitizePublicAnswer(text)).toBe(text);
    expect(SHOW_PUBLIC_SOURCE_METADATA).toBe(true);
  });
});
