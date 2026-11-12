import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { knowledgeBundleChunks, parseKnowledgeBundle } from "./knowledge-bundle";
import { directDatedTravelAnswer } from "./dated-policy.service";

const bundle = parseKnowledgeBundle(readFileSync(new URL("../../knowledge-packages/bradesco/Bradesco_PME_Seguro_Viagem_Schengen_Exterior.knowledge.json", import.meta.url)));
const pages = knowledgeBundleChunks(bundle).map(chunk => ({ ...chunk, documentId: 166, documentName: "Bradesco_PME_Seguro_Viagem_Schengen_Exterior.knowledge.json", sourceKind: "knowledge" }));
const question = (date: string) => `Tenho Bradesco Nacional contratado em ${date}. Ele cobre atendimento médico numa viagem para a França? Até quanto?`;
describe("versões de seguro viagem determinadas pelas datas das fontes", () => {
  it.each(["agosto de 2022", "julho de 2022", "01/07/2022", "2022-07-01"])("keeps the new Nacional version for %s", date => {
    const q = question(date); const result = directDatedTravelAnswer(q, q, pages)!;
    expect(result.answer).toContain("EUR 30.000");
    expect(result.answer).toContain("data de vigência/implantação");
    expect(result.sources[0]).toMatchObject({ pageStart: 2, locatorKind: "block" });
    expect(result.answer).not.toContain("assistência médico-hospitalar até BRL 10.000");
  });
  it.each(["maio de 2022", "junho de 2022", "30/06/2022", "2022-06-30"])("keeps the old version for %s", date => {
    const q = question(date); const result = directDatedTravelAnswer(q, q, pages)!;
    expect(result.sources[0]).toMatchObject({ pageStart: 3 });
    expect(result.answer).toContain("ausência de cobertura");
    expect(result.answer).toContain("BRL 10.000");
  });
  it("uses the current follow-up date rather than the earlier date in the resolved history", () => {
    const q = "E se meu Nacional for de maio de 2022, vale a mesma cobertura na França?";
    expect(directDatedTravelAnswer(q, `${question("agosto de 2022")}\nContinuação: ${q}`, pages)?.sources[0]).toMatchObject({ pageStart: 3 });
  });
  it.each(["2022", "30/02/2022", "antes de 01/07/2022", "depois de junho de 2022", "maio de 2022 ou agosto de 2022"])("does not choose a date from an ambiguous or invalid expression: %s", date => {
    const q = question(date); const result = directDatedTravelAnswer(q, q, pages)!;
    expect(result.sources).toHaveLength(2);
    expect(result.answer).toContain("dois períodos");
  });
  it("derives the boundary from source metadata and does not hardcode the cutoff year", () => {
    const changed = pages.map(page => ({ ...page, content: page.content.replaceAll("2022", "2030") }));
    const q = question("agosto de 2022");
    expect(directDatedTravelAnswer(q, q, changed)?.sources[0]).toMatchObject({ pageStart: 3 });
  });
  it("does not mix products, incomplete evidence or conflicting consolidated bases", () => {
    for (const product of ["Nacional Plus", "Premium", "Preferencial Plus"]) {
      const q = question("agosto de 2022").replace("Nacional", product);
      expect(directDatedTravelAnswer(q, q, pages)).toBeNull();
    }
    const q = question("agosto de 2022");
    expect(directDatedTravelAnswer(q, q, pages.filter(page => page.pageStart !== 2))).toBeNull();
    expect(directDatedTravelAnswer(q, q, [...pages, ...pages.map(page => ({ ...page, documentId: 200 }))])).toBeNull();
  });
});
