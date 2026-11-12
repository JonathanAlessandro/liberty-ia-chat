import { describe, expect, it } from "vitest";
import { expandTravelSearch } from "./travel-search";
import { resolveDocumentScope } from "./chat-retrieval";

const catalog = [
  { id: 1, name: "Painel_bradesco-pme_2026-10-28.pdf", group: "bradesco", kind: "pdf" },
  { id: 2, name: "Bradesco_PME_Seguro_Viagem_Schengen_Exterior.knowledge.json", group: "bradesco", kind: "knowledge" },
  { id: 3, name: "Painel_bradesco_hospitalar.pdf", group: "bradesco", kind: "pdf" },
];
describe("vocabulário coloquial de viagem", () => {
  it.each([
    ["No seguro viagem do Bradesco, qual o limite para reembolso de remédios comprados durante a viagem?", "farmacêuticas"],
    ["Se eu perder meus documentos viajando, quantas vezes posso pedir orientação pelo seguro do Bradesco?", "acionamento"],
    ["Perdi minha mala numa viagem com seguro Bradesco. Por quanto tempo ajudam a procurar?", "localização"],
  ])("uses the supplemental travel source and the right lexical terms for %s", (q, alias) => {
    expect(expandTravelSearch(q)).toContain(alias);
    expect(resolveDocumentScope(q, [], catalog).documentIds).toEqual([2]);
  });
  it.each(["Bradesco PME: qual carência para parto?", "Seguro saúde Bradesco tem reembolso de remédios?", "Quais documentos para contratar Bradesco PME?"])("does not displace the general manual for %s", q => {
    expect(expandTravelSearch(q)).toBe(q);
    expect(resolveDocumentScope(q, [], catalog).documentIds).not.toContain(2);
  });
});
