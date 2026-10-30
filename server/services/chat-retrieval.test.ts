import { describe, expect, it } from "vitest";
import { isConversationOnly, resolveDocumentScope } from "./chat-retrieval";
const catalog = [
  { id: 1, name: "Painel_medsenior-pf_2026-10-28.pdf", group: "medsênior" },
  { id: 2, name: "Painel_medsenior-pme_2026-10-28.pdf", group: "medsênior" },
  { id: 3, name: "Painel_alice_2026-10-28.pdf", group: "alice" },
  { id: 4, name: "Painel_amil-pme_2026-10-28.pdf", group: "amil" },
];
describe("operator and modality retrieval boundary", () => {
  it("keeps Alice as destination when the follow-up mentions SulAmerica as origin", () => {
    const docs = [...catalog, { id: 20, name: "Painel_sulamerica-pme.pdf", group: "sulamerica" }];
    const history = [{ role: "user", content: "A Alice compra carência de quem vem de outra operadora?" }, { role: "user", content: "Tenho 8 meses de SulAmérica. Como fica?" }];
    expect(resolveDocumentScope(history[1]!.content, history.slice(0, 1), docs).documentIds).toEqual([3]);
    expect(resolveDocumentScope("E se for uma operadora que não é congênere, mas tenho 14 meses?", history, docs).documentIds).toEqual([3]);
  });
  it("keeps Amil for terse follow-ups and never inherits the assistant's mistaken source", () => {
    const history = [{ role: "user", content: "Tenho 4 meses de Unimed. A Amil aproveita minha carência?" }, { role: "assistant", content: "Santa Helena compra carência." }, { role: "user", content: "E se eu tivesse 8 meses?" }];
    expect(resolveDocumentScope("Isso tira a carência do parto também?", history, catalog).documentIds).toEqual([4]);
  });
  it("lets a modality clarification replace PF and retains it for the next turn", () => {
    const history = [{ role: "user", content: "MedSenior individual compra carência?" }, { role: "user", content: "É no PME." }];
    expect(resolveDocumentScope("É no PME.", history.slice(0, 1), catalog).documentIds).toEqual([2]);
    expect(resolveDocumentScope("E pra doença preexistente?", history, catalog).documentIds).toEqual([2]);
  });
  it("retains intervening user corrections when resolving the next short question", () => {
    const history = [{ role: "user", content: "Tenho 4 meses de Unimed. A Amil aproveita minha carência?" }, { role: "user", content: "E se eu tivesse 8 meses?" }];
    const scope = resolveDocumentScope("Isso tira a carência do parto também?", history, catalog);
    expect(scope.question).toContain("8 meses");
    expect(scope.question).toContain("parto");
    expect(scope.documentIds).toEqual([4]);
  });
  const variants = [
    { id: 10, name: "Painel_trasmontano-pf_2026-10-28.pdf", group: "transmontano" },
    { id: 11, name: "Painel_trasmontano-pme_2026-10-28.pdf", group: "transmontano" },
    { id: 12, name: "Painel_hapvida-notredame-pme_2026-10-28.pdf", group: "hapvida notredame" },
    { id: 13, name: "Painel_notredame-metais-pme_2026-10-28.pdf", group: "hapvida notredame" },
    { id: 14, name: "Painel_seguros-unimed-pme_2026-10-28.pdf", group: "unimed" },
    { id: 15, name: "Painel_unimed-guarulhos-pme_2026-10-28.pdf", group: "unimed" },
    { id: 16, name: "Painel_medtour-pme_2026-10-28.pdf", group: "medtour" },
  ];
  it.each([
    ["Trasmontano PF idade mínima", [10]],
    ["Transmontano PME formação do grupo", [11]],
    ["Hapvida NotreDame PME formação do grupo", [12]],
    ["NotreDame Metais PME formação do grupo", [13]],
    ["Seguros Unimed PME mínimo de vidas", [14]],
    ["Unimed Guarulhos PME mínimo de vidas", [15]],
    ["Med Tour PME mínimo de vidas", [16]],
    ["MedTour PF idade mínima", []],
  ])("selects the actual product for %s", (question, ids) => {
    expect(resolveDocumentScope(question as string, [], variants).documentIds).toEqual(ids);
  });
  it("keeps the product identity for a follow-up without repeating the name", () => {
    expect(resolveDocumentScope("E qual o máximo desse produto?", [{ role: "user", content: "Hapvida NotreDame PME mínimo de vidas" }], variants).documentIds).toEqual([12]);
  });
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
