import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { knowledgeBundleChunks, parseKnowledgeBundle } from "./knowledge-bundle";
import { directConsolidatedPolicyAnswer } from "./consolidated-policy.service";

const bundle = parseKnowledgeBundle(readFileSync(new URL("../../knowledge-packages/bradesco/Bradesco_PME_Seguro_Viagem_Schengen_Exterior.knowledge.json", import.meta.url)));
const pages = knowledgeBundleChunks(bundle).map(chunk => ({ ...chunk, documentId: 1, documentName: "Bradesco_PME_Seguro_Viagem_Schengen_Exterior.knowledge.json", sourceKind: "knowledge" }));

describe("preservação de condições da base consolidada real", () => {
  it.each([
    ["Mudei a data da viagem. Posso corrigir a carta do seguro Bradesco? Qual é o prazo?", 13, "três dias úteis anteriormente à viagem"],
    ["Descobri que estou com covid antes de embarcar. O seguro viagem do Bradesco cobre esse caso?", 17, "Estar antes do embarque não prova"],
    ["Fiquei exatamente 10 dias internado durante uma viagem. O seguro do Bradesco já paga a passagem de um acompanhante?", 26, "MAIS DE dez dias corridos"],
    ["No seguro viagem do Bradesco, qual o limite para reembolso de remédios comprados durante a viagem?", 34, "até BRL 500"],
    ["Se eu perder meus documentos viajando, quantas vezes posso pedir orientação pelo seguro do Bradesco?", 22, "sem limite de acionamento"],
  ])("preserves the exact complete block for %s", (question, block, expected) => {
    const result = directConsolidatedPolicyAnswer(question as string, pages)!;
    expect(result.answer).toContain(expected);
    expect(result.sources[0]).toMatchObject({ pageStart: block, locatorKind: "block" });
    if (block === 13) {
      expect(result.answer).not.toContain("download imediato");
      expect(result.answer).not.toContain("Confirme o regime");
    }
    if (block === 26 || block === 34) {
      expect(result.answer).toContain("Preferencial Plus / Nacional até 30/06/2022");
      expect(result.answer).toContain("Nacional a partir de 01/07/2022");
    }
    if (block === 17) expect(result.answer).not.toContain("essa situação não está coberta");
  });
  it("separates baggage indemnity and location without promising payment", () => {
    const result = directConsolidatedPolicyAnswer("Perdi minha mala numa viagem com seguro Bradesco. Quanto recebo de indenização e por quanto tempo ajudam a procurar?", pages)!;
    expect(result.sources.map(source => source.type === "document" ? source.pageStart : 0)).toEqual([33, 25]);
    expect(result.answer).toContain("até BRL 200");
    expect(result.answer).toContain("até 30 dias corridos");
    expect(result.answer).toContain("não representam promessa de pagamento automático");
    expect(result.answer).not.toContain("você receberá");
  });
  it("does not turn a routine-care question into an unsupported universal exclusion", () => {
    const result = directConsolidatedPolicyAnswer("Com o seguro viagem do Bradesco posso marcar consultas de rotina no exterior como faço com meu plano de saúde?", pages)!;
    expect(result.sources[0]).toMatchObject({ pageStart: 9 });
    expect(result.answer).toContain("seguro viagem não é plano de saúde");
    expect(result.answer).toContain("Não deduzir cobertura irrestrita");
    expect(result.answer).not.toContain("não inclui tratamento eletivo");
  });
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
