import { describe, expect, it } from "vitest";
import { directAccompaniedChildAnswer, directCommercialAnswer, type PolicyPage } from "./commercial-policy.service";

const page = (name: string, content: string, documentId = 1): PolicyPage => ({ documentId, documentName: name, sourceKind: "pdf", pageStart: 2, pageEnd: 2, content });
describe("evidence-derived commercial facts", () => {
  const cancellation = [
    page("Painel_medsenior-pf.pdf", "Para ter redução de carência - o plano anteriormente contratado deve estar ativo ou ter sido cancelado há, no máximo 60 dias da data de imputação da proposta no sistema da Medsênior."),
    page("Painel_medsenior-pme.pdf", "O plano anterior deve estar ativo ou ter sido cancelado há, no máximo, 30 dias da data de imputação da proposta no sistema da Medsênior.", 2),
  ];
  it("answers PF and PME separately for cancellation 45 days ago", () => {
    const q = "Cancelei meu plano há 45 dias. Ainda consigo aproveitar carência na MedSenior?";
    const result = directCommercialAnswer(q, q, cancellation)!;
    expect(result.answer).toContain("PF / individual:** 45 dias estão dentro da janela de 60 dias");
    expect(result.answer).toContain("PME / empresarial:** 45 dias ultrapassam a janela de 30 dias");
    expect(result.answer).not.toContain("ausência de intervalo");
    expect(result.sources).toHaveLength(2);
  });
  it.each([[60, "estão dentro"], [61, "ultrapassam"]])("compares the actual cancellation deadline at %s days", (days, expected) => {
    const q = `Cancelei há ${days} dias. Posso reduzir carência?`;
    expect(directCommercialAnswer(q, q, cancellation.slice(0, 1))?.answer).toContain(expected);
  });
  it("does not silently omit a modality without an unambiguous cancellation rule", () => {
    const q = "Cancelei há 45 dias. Aproveita carência?";
    expect(directCommercialAnswer(q, q, [cancellation[0]!, page("outro-pme.pdf", "Sem regra de cancelamento.", 2)])).toBeNull();
    expect(directCommercialAnswer("E pra parto?", q, cancellation)).toBeNull();
    for (const origin of ["Cancelei meu plano MedSenior há 45 dias. Posso aproveitar carência?", "Cancelei há 45 dias e quero voltar para o mesmo plano."]) {
      expect(directCommercialAnswer(origin, origin, cancellation)).toBeNull();
    }
  });
  it("keeps the column attached to its modality, using the document's column number", () => {
    const q = "MedTour aproveita carência de quem tem 5 meses de plano?";
    const pages = [page("Painel_medtour-pf.pdf", "Coluna 2 - Válida para beneficiários com permanência de 04 a 19 meses no plano anterior."), page("Painel_medtour-pme.pdf", "Coluna 1 - Válida para beneficiários com permanência de 04 a 19 meses no plano anterior.", 2)];
    const result = directCommercialAnswer(q, q, pages)!;
    expect(result.answer).toContain("PF / individual:** 5 meses se enquadram na **Coluna 2**");
    expect(result.answer).toContain("PME / empresarial:** 5 meses se enquadram na **Coluna 1**");
    expect(directCommercialAnswer(q, q, [page("futuro-pf.pdf", pages[0]!.content.replace("Coluna 2", "Coluna 4"))])?.answer).toContain("**Coluna 4**");
    expect(directCommercialAnswer("No Sênior MedTour aproveita 5 meses de plano?", q, pages)).toBeNull();
    expect(directCommercialAnswer("Sou funcionário público, como aproveita 5 meses?", q, pages)).toBeNull();
  });
  it.each([6, 12, 14, 30])("does not invent a ceiling for non-congenere permanence of %s months", months => {
    const q = `A Alice aproveita ${months} meses de uma operadora que não é congênere?`;
    const result = directCommercialAnswer(q, q, [page("Painel_alice.pdf", "Parcial - Válido para empresas advindas de operadoras não congêneres a partir de 06 meses e para empresas congêneres de 06 a 12 meses;")])!;
    expect(result.answer).toContain("permite **redução parcial**");
    expect(result.answer).not.toContain("não aproveita");
    expect(result.answer).not.toContain("redução total");
  });
  it("does not approve a permanence below the documented non-congenere minimum", () => {
    const q = "A Alice aproveita 5 meses de operadora não congênere?";
    expect(directCommercialAnswer(q, q, [page("alice.pdf", "Parcial - Válido para empresas advindas de operadoras não congêneres a partir de 06 meses;")])?.answer).toContain("ainda não é atingido");
  });
  it("does not classify Unimed compatibility by guessing, and uses the latest supplied duration", () => {
    const rules = page("Painel_amil-pme.pdf", "PRC 608 - aplicado aos beneficiários anteriormente vinculados a qualquer outra operadora, com exceção das congêneres, por período de 03 a 11 meses e 29 dias; ou que tenham sido anteriormente vinculados a operadoras congêneres por período de 03 a 05 meses e 29 dias e desde que o prazo não exceda 60 dias. PRC 609 - aplicado aos beneficiários vinculados a qualquer outra operadora, com exceção das congêneres, por período superior a 12 meses. PRC 617 - aplicado aos beneficiários vinculados a operadoras congêneres por período superior a 6 meses e desde que a janela não exceda 60 dias. Para consultar a compatibilidade dos planos das operadoras congêneres - Clique aqui");
    const q = "E se eu tivesse 8 meses?";
    const result = directCommercialAnswer(q, `Tenho 4 meses de Unimed. A Amil aproveita minha carência?\nContinuação: ${q}`, [rules])!;
    expect(result.answer).toContain("Com 8 meses");
    expect(result.answer).not.toContain("Com 4 meses");
    expect(result.answer).toContain("**PRC 608**");
    expect(result.answer).toContain("**PRC 617**");
    expect(result.answer).toContain("Não confirmei a compatibilidade");
    expect(result.answer).not.toContain("Unimed não é");
    expect(result.answer).not.toContain("300 dias");
    expect(directCommercialAnswer("Isso tira a carência do parto?", q, [rules])).toBeNull();
  });
  it("states the child accompaniment condition without denying inclusion or inventing roles", () => {
    const source = page("Painel_unihosp-pf.pdf", "Composição / Quem Pode Aderir\nIndividual Titular - A partir de 08 anos. Para inclusão de menores de 8 anos é obrigatória a presença de pelo\nmenos uma vida maior de 18 anos com vínculo familiar direto. Sênior Titular - A partir de 44 anos.");
    const result = directAccompaniedChildAnswer("Meu filho tem 7 anos. Pode entrar no Unihosp individual?", [source])!;
    expect(result.answer).toContain("Para uma criança de 7 anos, a inclusão tem esta condição expressa");
    expect(result.answer).toContain("vida maior de 18 anos com vínculo familiar direto");
    expect(result.answer).not.toContain("não pode ser incluído");
    expect(result.answer).not.toContain("pode ser incluído como dependente");
    expect(directAccompaniedChildAnswer("Meu filho de 7 anos pode ser titular?", [source])).toBeNull();
    expect(directAccompaniedChildAnswer("Meu filho de 9 anos pode entrar?", [source])).toBeNull();
  });
});
