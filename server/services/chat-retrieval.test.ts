import { describe, expect, it } from "vitest";
import { isConversationOnly, resolveDocumentScope } from "./chat-retrieval";
const catalog = [
  { id: 1, name: "Painel_medsenior-pf_2026-10-28.pdf", group: "medsênior" },
  { id: 2, name: "Painel_medsenior-pme_2026-10-28.pdf", group: "medsênior" },
  { id: 3, name: "Painel_alice_2026-10-28.pdf", group: "alice" },
  { id: 4, name: "Painel_amil-pme_2026-10-28.pdf", group: "amil" },
];
describe("operator and modality retrieval boundary", () => {
  it("keeps MedSênior PF separate from PME and other operators", () => {
    expect(resolveDocumentScope("No MedSênior individual PF, qual é a idade mínima do titular e existe idade máxima? Consulte o Painel do Corretor.", [], catalog).documentIds).toEqual([1]);
  });
  it("resolves a long follow-up without relying on the old six-token limit", () => {
    expect(resolveDocumentScope("E uma pessoa de 43 anos pode ser titular desse mesmo produto?", [{ role: "user", content: "No MedSênior individual PF, qual é a idade mínima do titular?" }], catalog).documentIds).toEqual([1]);
  });
  it("uses the explicitly changed operator instead of the prior chat subject", () => {
    expect(resolveDocumentScope("E na Amil PME?", [{ role: "user", content: "MedSênior PF idade mínima" }], catalog).documentIds).toEqual([4]);
  });
  it("scopes short and detailed Alice questions identically", () => {
    for (const question of ["Alice PME: mínimo de vidas e titulares?", "Segundo o Painel do Corretor, no Alice PME, qual é o mínimo de vidas e quantos titulares com vínculo são exigidos para formar o grupo?"]) {
      expect(resolveDocumentScope(question, [], catalog).documentIds).toEqual([3]);
    }
  });
  it("does not assume another chat's subject when no follow-up exists", () => {
    expect(resolveDocumentScope("Qual o prazo de portabilidade da ANS?", [{ role: "user", content: "MedSênior PF idade mínima" }], catalog).documentIds).toEqual([]);
  });
  it("keeps fictitious conversation codes out of document retrieval", () => {
    expect(isConversationOnly("Teste de memória: o código fictício desta conversa é QA-LIB-728.")).toBe(true);
    expect(isConversationOnly("Qual é o código fictício que informei no início deste chat?")).toBe(true);
    expect(isConversationOnly("Qual o código do produto Amil PME?")).toBe(false);
  });
});
