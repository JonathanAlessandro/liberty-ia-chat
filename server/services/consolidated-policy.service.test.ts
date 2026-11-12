import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { knowledgeBundleChunks, parseKnowledgeBundle } from "./knowledge-bundle";
import { directConsolidatedPolicyAnswer } from "./consolidated-policy.service";

const bundle = parseKnowledgeBundle(readFileSync(new URL("../../knowledge-packages/bradesco/Bradesco_PME_Seguro_Viagem_Schengen_Exterior.knowledge.json", import.meta.url)));
const pages = knowledgeBundleChunks(bundle).map(chunk => ({ ...chunk, documentId: 1, documentName: "Bradesco_PME_Seguro_Viagem_Schengen_Exterior.knowledge.json", sourceKind: "knowledge" }));

describe("preservação de condições da base consolidada real", () => {
  it("keeps the site channel for prepaid Nacional Plus WITHOUT Concierge and limits immediate download", () => {
    const result = directConsolidatedPolicyAnswer("Tenho Bradesco Nacional Plus sem Concierge. Consigo baixar a carta do seguro viagem na hora?", pages)!;
    expect(result.answer).toContain("Nacional Plus em pré-pagamento sem Concierge: solicitação também pelo site");
    expect(result.answer).toContain("Com Concierge: solicitação pelo site ou aplicativo exclusivos, com download imediato");
    expect(result.answer).toContain("até três dias úteis");
    expect(result.answer).toContain("Confirme o regime de pagamento");
    expect(result.sources[0]).toMatchObject({ locatorKind: "block", pageStart: 12 });
  });
  it("keeps all three plan versions and the original BRL reimbursement value", () => {
    const result = directConsolidatedPolicyAnswer("No seguro viagem do Bradesco, quanto reembolsa de hotel depois da alta hospitalar?", pages)!;
    for (const text of ["Plano I: Preferencial Plus / Nacional até 30/06/2022", "Plano II: Nacional Plus / Premium", "Plano III: Nacional a partir de 01/07/2022", "BRL 1.000", "APÓS alta", "capital segurado", "páginas 3", "páginas 1"]) expect(result.answer).toContain(text);
    expect(result.sources[0]).toMatchObject({ locatorKind: "block", pageStart: 36 });
  });
  it("does not infer from a partial block, unrelated topic, conflicting versions or a PDF", () => {
    const question = "Quanto reembolsa de hotel após alta?";
    expect(directConsolidatedPolicyAnswer(question, pages.map(page => ({ ...page, sourceKind: "pdf" })))).toBeNull();
    expect(directConsolidatedPolicyAnswer(question, pages.map(page => ({ ...page, content: page.content.replace(/Planos \/ versões:/g, "Versões:") })))).toBeNull();
    expect(directConsolidatedPolicyAnswer(question, [...pages, ...pages.map(page => ({ ...page, documentId: 2 }))])).toBeNull();
    expect(directConsolidatedPolicyAnswer("Qual o limite médico na França?", pages)).toBeNull();
  });
});
