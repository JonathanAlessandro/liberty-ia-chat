import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  getAiConfiguration: vi.fn(),
  listChatDocumentCatalog: vi.fn(),
  listReadyPageChunks: vi.fn(),
  searchReadyChunksWithDocuments: vi.fn(),
  listReadyRegisteredWebDocuments: vi.fn(),
}));
const llm = vi.hoisted(() => ({ completeDocumentAnswer: vi.fn(), completeGroundedAnswer: vi.fn() }));
const externalSearch = vi.hoisted(() => ({ crawlExternalEvidence: vi.fn(), verifyResearchEvidence: vi.fn() }));

vi.mock("../repositories/document.repository", () => repository);
vi.mock("./llm.service", () => llm);
vi.mock("./external-search.service", () => externalSearch);

import { answerWithDocumentContext, directPolicySectionAnswer, rankRelevantContext, selectRelevantContext } from "./chat-context.service";

describe("answerWithDocumentContext", () => {
  it("reads the actual registered ANS page if research has no verifiable result", async () => {
    repository.searchReadyChunksWithDocuments.mockResolvedValue([]);
    repository.listReadyRegisteredWebDocuments.mockResolvedValue([
      { id: 1, originalName: "Carência — ANS", storageKey: "https://www.gov.br/ans/pt-br/assuntos/consumidor/carencia", sourceGroup: "ans" },
      { id: 2, originalName: "Reajuste — ANS", storageKey: "https://www.gov.br/ans/reajuste", sourceGroup: "ans" },
    ]);
    externalSearch.verifyResearchEvidence.mockResolvedValue([{ type: "external", origin: "url-list", title: "Carência ANS", url: "https://www.gov.br/ans/pt-br/assuntos/consumidor/carencia", domain: "www.gov.br", content: "Página consultada: urgência e emergência, 24 horas." }]);
    llm.completeGroundedAnswer.mockResolvedValue({ answer: "24 horas [F1].", sourceIds: ["F1"] });
    const result = await answerWithDocumentContext("Pesquise na ANS a carência de urgência e emergência");
    expect(externalSearch.verifyResearchEvidence).toHaveBeenCalledWith([expect.objectContaining({ origin: "url-list", url: "https://www.gov.br/ans/pt-br/assuntos/consumidor/carencia", content: "" })]);
    expect(llm.completeGroundedAnswer.mock.calls[0][0][2].content).toContain("Página consultada");
    expect(result.sources).toEqual([expect.objectContaining({ type: "external", origin: "url-list" })]);
  });
  it("does not use unrelated or non-ANS registered pages as the fallback", async () => {
    repository.searchReadyChunksWithDocuments.mockResolvedValue([]);
    repository.listReadyRegisteredWebDocuments.mockResolvedValue([
      { id: 1, originalName: "Carência", storageKey: "https://example.org/ans/carencia", sourceGroup: "ans" },
      { id: 2, originalName: "Reajuste ANS", storageKey: "https://www.gov.br/ans/reajuste", sourceGroup: "ans" },
    ]);
    await answerWithDocumentContext("ANS carência de urgência e emergência");
    expect(externalSearch.verifyResearchEvidence).not.toHaveBeenCalled();
    expect(llm.completeGroundedAnswer).not.toHaveBeenCalled();
  });
  it("ignores appended visual/table reconstructions without cutting the next page's policy continuation", () => {
    const base = { documentId: 1, chunkId: 1, documentName: "Painel_bradesco-pme.pdf", sourceKind: "pdf", sourceAuthority: "internal_training" as const, sourceGroup: "bradesco", effectiveAt: null, storageKey: "doc.pdf" };
    const result = directPolicySectionAnswer("Qual a formação do grupo?", [
      { ...base, pageStart: 11, pageEnd: 11, content: "Formação do Grupo\nGrupos de 03 vidas. Grupos de 04 a 29 vidas. Grupos de 30 a 99 vidas.\nLeitura visual estruturada:\nTabela: Planos\nTOP R$109,76\nForma de Pagamento\nBoleto\nFormação do Grupo\n3 vidas" },
      { ...base, pageStart: 12, pageEnd: 12, content: "Para titulares dependentes entre si será obrigatória a utilização da tabela a partir de 3 vidas.\nInformações Importantes\nOutra regra" },
    ]);
    expect(result?.answer).toContain("titulares dependentes entre si");
    expect(result?.answer).not.toContain("109,76");
    expect(result?.answer).not.toContain("Leitura visual");
  });
  it("preserves the under-eight exception instead of reporting the general age as an absolute minimum", () => {
    const page = { documentId: 1, chunkId: 1, documentName: "Painel_unihosp-pf.pdf", sourceKind: "pdf", sourceAuthority: "internal_training" as const, sourceGroup: "unihosp", effectiveAt: null, storageKey: "doc.pdf", pageStart: 7, pageEnd: 7, content: "Composição / Quem Pode Aderir\nTitular de 08 anos até 82 anos.\nMenores de 8 anos com pelo menos uma vida maior de 18 anos com vínculo familiar direto.\nSênior: a partir de 44 anos.\nContratos e/ou Aditivos Vigentes\nProposta online" };
    const result = directPolicySectionAnswer("Unihosp PF quais as idades mínima e máxima?", [page]);
    expect(result?.answer).toContain("Menores de 8 anos");
    expect(result?.answer).toContain("vínculo familiar direto");
    expect(result?.answer).toContain("Sênior: a partir de 44 anos");
    expect(result?.answer).not.toContain("Proposta online");
    expect(directPolicySectionAnswer("Uma pessoa de 43 anos pode aderir?", [page])).toBeNull();
  });
  it("quotes group conditions across a page break without adding or omitting qualifications", () => {
    const base = { documentId: 1, chunkId: 1, documentName: "Painel_omint-pme.pdf", sourceKind: "pdf", sourceAuthority: "internal_training" as const, sourceGroup: "omint", effectiveAt: null, storageKey: "doc.pdf" };
    const result = directPolicySectionAnswer("Qual a formação do grupo Omint PME?", [
      { ...base, pageStart: 6, pageEnd: 6, content: "Forma de Pagamento\nBoleto\nFormação do Grupo\nPainel do Corretor | Coleta 6" },
      { ...base, pageStart: 7, pageEnd: 7, content: "ME de 01 a 29 vidas - Exceto Hospitalar\nMínimo 01 titular com vínculo societário\nPME de 04 a 99 vidas\nMínimo de 02 titulares com vínculo mais 02 dependentes.\nMovimentação Cadastral\nSomente nascimento, casamento ou adoção." },
    ]);
    expect(result?.answer).toContain("02 titulares com vínculo mais 02 dependentes");
    expect(result?.answer).toContain("01 titular com vínculo societário");
    expect(result?.answer).not.toContain("nascimento");
    expect(result?.sources).toEqual([expect.objectContaining({ pageStart: 6, pageEnd: 7 })]);
  });
  it("does not quote an incomplete section or substitute an external answer", () => {
    const page = { documentId: 1, chunkId: 1, documentName: "Painel.pdf", sourceKind: "pdf", sourceAuthority: "internal_training" as const, sourceGroup: "amil", effectiveAt: null, storageKey: "doc.pdf", pageStart: 1, pageEnd: 1, content: "Formação do Grupo\nPME 02 a 99 vidas" };
    expect(directPolicySectionAnswer("Formação do grupo Amil PME?", [page])).toBeNull();
    expect(directPolicySectionAnswer("Qual a carência e formação do grupo?", [page])).toBeNull();
  });
  it.each([
    ["PME de 03 a 29 vidas;\nMínimo de 01 titular + 02 dependentes.\nMAIS de 30 a 99 vidas;", "MAIS de 30 a 99 vidas"],
    ["Grupos a partir de 03 vidas: mínimo 1 titular e máximo 3 titulares.\nGrupos de 04 a 29 vidas: 02 titulares + 02 dependentes.\nGrupos de 30 a 99 vidas.\nPara titulares dependentes entre si será obrigatória a utilização da tabela a partir de 3 vidas.", "titulares dependentes entre si"],
  ])("preserves the entire group section including its last condition", (content, expected) => {
    const page = { documentId: 1, chunkId: 1, documentName: "Painel.pdf", sourceKind: "pdf", sourceAuthority: "internal_training" as const, sourceGroup: "operadora", effectiveAt: null, storageKey: "doc.pdf", pageStart: 1, pageEnd: 1, content: `Formação do Grupo\n${content}\nMovimentação Cadastral\nSomente nascimento.` };
    const result = directPolicySectionAnswer("Qual a formação do grupo?", [page]);
    expect(result?.answer).toContain(expected);
    expect(result?.answer).not.toContain("Somente nascimento");
  });
  it("includes exceptions in the rest of the selected page even without matching keywords", async () => {
    llm.completeGroundedAnswer.mockResolvedValue({ answer: "08 anos, com exceção para menores acompanhados [F1].", sourceIds: ["F1"] });
    const base = { documentId: 1, documentName: "Painel_unihosp-pf.pdf", sourceKind: "pdf", sourceAuthority: "internal_training", sourceGroup: "unihosp", effectiveAt: null, storageKey: "doc.pdf", pageStart: 7, pageEnd: 7 };
    repository.listChatDocumentCatalog.mockResolvedValue([{ id: 1, name: base.documentName, group: "unihosp" }]);
    repository.searchReadyChunksWithDocuments.mockResolvedValue([{ ...base, chunkId: 1, content: "Composição / Quem Pode Aderir\nTitular de 08 anos até 82 anos." }]);
    repository.listReadyPageChunks.mockResolvedValue([
      { ...base, chunkId: 1, content: "Composição / Quem Pode Aderir\nTitular de 08 anos até 82 anos." },
      { ...base, chunkId: 2, content: "Para inclusão de menores de 8 anos é obrigatória uma vida maior de 18 com vínculo familiar direto." },
      { ...base, documentId: 99, chunkId: 3, content: "Operadora indevida: sem limites." },
    ]);
    await answerWithDocumentContext("Unihosp PF quais as idades mínima e máxima?");
    const context = llm.completeGroundedAnswer.mock.calls[0][0][1].content;
    expect(context).toContain("menores de 8 anos");
    expect(context).not.toContain("Operadora indevida");
  });
  it.each([
    ["MedTour PME formação do grupo: mínimo e máximo de vidas e titulares", "Formação do Grupo\nPME de 01 a 99 vidas. Mínimo 1 titular"],
    ["Unihosp PF idades mínima e máxima do titular", "Composição / Quem Pode Aderir\nTitular: 08 a 82 anos. Menores de 8 anos com uma vida maior de 18 com vínculo familiar direto."],
  ])("retrieves the actual rule ahead of repeated price terms: %s", (question, rule) => {
    const base = { documentId: 1, documentName: "Painel_medtour-pme.pdf", sourceKind: "pdf" as const, sourceAuthority: "internal_training" as const, sourceGroup: "medtour", effectiveAt: null, storageKey: "doc.pdf", pageStart: 1, pageEnd: 1 };
    const result = selectRelevantContext(question, [
      ...Array.from({ length: 12 }, (_, i) => ({ ...base, chunkId: i, content: `${question}\nTabela de preços e faixas. Consulte valores e regras.` })),
      { ...base, chunkId: 99, content: rule },
    ]);
    expect(result[0]?.chunkId).toBe(99);
  });
  it("does not fall back to another operator when the requested modality is missing", async () => {
    repository.listChatDocumentCatalog.mockResolvedValue([{ id: 1, name: "Painel_medtour-pme.pdf", group: "medtour" }]);
    const result = await answerWithDocumentContext("MedTour PF idade mínima");
    expect(result.sources).toEqual([]);
    expect(repository.searchReadyChunksWithDocuments).not.toHaveBeenCalled();
    expect(llm.completeGroundedAnswer).not.toHaveBeenCalled();
  });
  it("uses only official evidence for general ANS questions and renders grouped citations", async () => {
    repository.searchReadyChunksWithDocuments.mockResolvedValue([{ chunkId: 1, documentId: 2, documentName: "Painel_amil.pdf", sourceKind: "pdf", sourceAuthority: "internal_training", sourceGroup: "amil", effectiveAt: null, storageKey: "doc.pdf", pageStart: 1, pageEnd: 1, content: "Carência: 24 horas para urgência e emergência." }]);
    externalSearch.crawlExternalEvidence.mockResolvedValue([
      { type: "external", origin: "ai-search", title: "Carência ANS", url: "https://www.gov.br/ans/carencia", domain: "gov.br", content: "Carência máxima de 24 horas." },
      { type: "external", origin: "ai-search", title: "Regra ANS", url: "https://www.gov.br/ans/regra", domain: "gov.br", content: "Urgência e emergência: 24 horas." },
    ]);
    llm.completeGroundedAnswer.mockResolvedValue({ answer: "24 horas [F1, F2].", sourceIds: ["F1", "F2"] });
    const result = await answerWithDocumentContext("Segundo a ANS, qual a carência para urgência e emergência?");
    expect(result.sources.every(source => source.type === "external")).toBe(true);
    expect(result.answer).toContain("[Carência ANS](https://www.gov.br/ans/carencia)");
    expect(result.answer).toContain("[Regra ANS](https://www.gov.br/ans/regra)");
    expect(result.answer).not.toContain("[F");
    expect(llm.completeGroundedAnswer.mock.calls[0][0][1].content).not.toContain("Painel_amil");
  });
  it("never shows unrelated PDFs for conversation-only memory questions", async () => {
    llm.completeDocumentAnswer.mockResolvedValue("QA-LIB-728");
    const response = await answerWithDocumentContext("Qual o código fictício que informei no início deste chat?", [{ role: "user", content: "O código fictício é QA-LIB-728" }]);
    expect(response.sources).toEqual([]);
    expect(repository.searchReadyChunksWithDocuments).not.toHaveBeenCalled();
    expect(externalSearch.crawlExternalEvidence).not.toHaveBeenCalled();
  });
  it("does not invent ANS deadlines when official research supplies no evidence", async () => {
    repository.searchReadyChunksWithDocuments.mockResolvedValue([{ chunkId: 1, documentId: 2, documentName: "Painel_amil.pdf", sourceKind: "pdf", sourceAuthority: "internal_training", sourceGroup: "amil", effectiveAt: null, storageKey: "doc.pdf", pageStart: 1, pageEnd: 1, content: "Portabilidade: solicitar carta." }]);
    const response = await answerWithDocumentContext("Pesquise na ANS o prazo para cancelar o plano após portabilidade.");
    expect(response.answer).toContain("Não foi possível confirmar");
    expect(response.sources).toEqual([]);
    expect(llm.completeGroundedAnswer).not.toHaveBeenCalled();
  });
  it("filters candidate documents before answering long operator-specific questions", async () => {
    repository.listChatDocumentCatalog.mockResolvedValue([{ id: 7, name: "Painel_alice_2026-10-28.pdf", group: "alice" }]);
    repository.searchReadyChunksWithDocuments.mockResolvedValue([
      { chunkId: 1, documentId: 7, documentName: "Painel_alice_2026-10-28.pdf", sourceKind: "pdf", sourceAuthority: "internal_training", sourceGroup: "alice", effectiveAt: null, storageKey: "alice.pdf", pageStart: 6, pageEnd: 6, content: "Formação do Grupo: PME de 01 a 99 vidas; Mínimo de 01 titular com vínculo." },
      { chunkId: 2, documentId: 8, documentName: "Painel_porto.pdf", sourceKind: "pdf", sourceAuthority: "internal_training", sourceGroup: "porto", effectiveAt: null, storageKey: "porto.pdf", pageStart: 3, pageEnd: 3, content: "PME mínimo titulares vidas vínculo formação de grupo." },
    ]);
    llm.completeGroundedAnswer.mockResolvedValue({ answer: "Mínimo de 1 vida e 1 titular com vínculo [F1].", sourceIds: ["F1"] });
    const response = await answerWithDocumentContext("Segundo o Painel do Corretor, no Alice PME, qual é o mínimo de vidas e quantos titulares com vínculo são exigidos para formar o grupo?");
    expect(repository.searchReadyChunksWithDocuments).toHaveBeenCalledWith(expect.any(Array), 200, [7]);
    expect(response.sources).toEqual([expect.objectContaining({ documentId: 7 })]);
    expect(llm.completeGroundedAnswer.mock.calls[0][0][1].content).not.toContain("Porto");
  });
  it("researches regulatory questions alongside internal conditions without replacing the document context", async () => {
    repository.listChatDocumentCatalog.mockResolvedValue([{ id: 2, name: "Painel_amil.pdf", group: "amil" }]);
    repository.searchReadyChunksWithDocuments.mockResolvedValue([{ chunkId: 1, documentId: 2, documentName: "Painel_amil.pdf", sourceKind: "pdf", sourceAuthority: "internal_training", sourceGroup: "amil", effectiveAt: null, storageKey: "doc.pdf", pageStart: 1, pageEnd: 1, content: "Amil carência contratual: 180 dias." }]);
    externalSearch.crawlExternalEvidence.mockResolvedValue([{ type: "external", origin: "ai-search", title: "ANS", url: "https://www.gov.br/ans/regra", domain: "gov.br", content: "Regra regulatória geral da ANS." }]);
    llm.completeDocumentAnswer.mockResolvedValue("O Painel informa 180 dias; a ANS traz a regra geral.");
    const response = await answerWithDocumentContext("Segundo a ANS, qual a carência da Amil?");
    expect(externalSearch.crawlExternalEvidence).toHaveBeenCalled();
    const messages = llm.completeDocumentAnswer.mock.calls[0][0];
    expect(messages[1].content).toContain("180 dias");
    expect(messages[2].content).toContain("Regra regulatória geral");
    expect(messages[0].content).toContain("nunca substituem silenciosamente");
    expect(response.sources.map(source => source.type)).toEqual(["document", "external"]);
  });
  it("keeps the exact procedure ahead of similar words for the reported question", async () => {
    const base = { documentName: "Omint reembolso.xlsx", pageStart: 1, pageEnd: 1, sourceKind: "spreadsheet", sourceAuthority: "internal_training", sourceGroup: "omint", effectiveAt: null, storageKey: "documents/table.xlsx" };
    repository.searchReadyChunksWithDocuments.mockResolvedValue([
      ...Array.from({ length: 6 }, (_, i) => ({ ...base, chunkId: i, documentId: i, content: "Psicologia reembolso 100,00" })),
      { ...base, chunkId: 10, documentId: 10, content: "Planilha: Reembolso\nLinha 15\nCabeçalhos próximos: linha 7: A=Despesas Ambulatoriais: | B=15 | C=16 | D=17 | E=19/39\nA [Despesas Ambulatoriais:]: Psicoterapia por Sessão | B [PLANOS OMINT / 15]: 146.23 | C [PLANOS OMINT / 16]: 194.53 | D [PLANOS OMINT / 17]: 206.51 | E [PLANOS OMINT / 19/39]: 227.49\nVigência: 01/01/2025" },
    ]);
    const result = await answerWithDocumentContext("qual reembolso para psicoterapia categoria c16 da omint?");
    expect(result.answer).toBe("Para Psicoterapia por Sessão, na categoria C16 (coluna 16 da planilha), o valor informado é R$ 194,53 por sessão, com vigência de 01/01/2025.");
    expect(llm.completeDocumentAnswer).not.toHaveBeenCalled();
    expect(externalSearch.crawlExternalEvidence).not.toHaveBeenCalled();
  });

  it("answers an exact category from a structured PDF table without calling the model", async () => {
    repository.searchReadyChunksWithDocuments.mockResolvedValue([{
      chunkId: 11,
      documentId: 11,
      documentName: "Reembolso Medicina.pdf",
      pageStart: 1,
      pageEnd: 1,
      sourceKind: "pdf",
      sourceAuthority: "internal_training",
      sourceGroup: "omint",
      effectiveAt: null,
      storageKey: "documents/reembolso.pdf",
      content: "Tabela: PLANOS OMINT\nLinha: Psicoterapia por Sessão\nColuna 15: 146,23\nColuna 16: 194,53\nColuna 17: 206,51\nColuna 19/39: 227,49\nVigência: 01/01/2025",
    }]);

    const result = await answerWithDocumentContext("qual reembolso para psicoterapia categoria c16 da omint?");

    expect(result.answer).toBe("Para Psicoterapia por Sessão, na categoria C16 (coluna 16 do documento), o valor informado é R$ 194,53 por sessão, com vigência de 01/01/2025.");
    expect(llm.completeDocumentAnswer).not.toHaveBeenCalled();
    expect(externalSearch.crawlExternalEvidence).not.toHaveBeenCalled();
  });

  it("finds an exact table row before limiting interpretive context to five chunks", async () => {
    const base = { documentName: "Omint reembolso.xlsx", pageStart: 1, pageEnd: 1, sourceKind: "spreadsheet", sourceAuthority: "internal_training", sourceGroup: "omint", effectiveAt: null, storageKey: "documents/table.xlsx" };
    repository.searchReadyChunksWithDocuments.mockResolvedValue([
      ...Array.from({ length: 7 }, (_, index) => ({
        ...base,
        chunkId: index + 1,
        documentId: index + 1,
        content: `Psicoterapia categoria C16 Omint material explicativo ${index}`,
      })),
      {
        ...base,
        chunkId: 20,
        documentId: 20,
        content: "Planilha: Reembolso\nLinha 15\nA [Despesas Ambulatoriais]: Psicoterapia por Sessão | C [PLANOS OMINT / 16]: 194.53\nVigência: 01/01/2025",
      },
    ]);

    const result = await answerWithDocumentContext("qual reembolso para psicoterapia categoria c16 da omint?");

    expect(result.answer).toContain("R$ 194,53");
    expect(llm.completeDocumentAnswer).not.toHaveBeenCalled();
    expect(externalSearch.crawlExternalEvidence).not.toHaveBeenCalled();
  });
  it("searches short numeric codes and keeps longer identifiers intact", async () => {
    repository.searchReadyChunksWithDocuments.mockResolvedValue([]);
    repository.getAiConfiguration.mockResolvedValue({ systemPrompt: "Teste" });
    repository.listReadyRegisteredWebDocuments.mockResolvedValue([]);
    externalSearch.crawlExternalEvidence.mockResolvedValue([]);
    llm.completeDocumentAnswer.mockResolvedValue("Resposta");
    await answerWithDocumentContext("psicoterapia 16 C123456");
    expect(repository.searchReadyChunksWithDocuments).toHaveBeenCalledWith(["psico", "16", "c123456", "123456"]);
  });
  beforeEach(() => {
    vi.resetAllMocks();
    externalSearch.verifyResearchEvidence.mockImplementation(async sources => sources);
    repository.listChatDocumentCatalog.mockResolvedValue([]);
    repository.listReadyPageChunks.mockResolvedValue([]);
    llm.completeGroundedAnswer.mockImplementation(async (messages, sources) => ({ answer: await llm.completeDocumentAnswer(messages), sourceIds: sources.map((source: { id: string }) => source.id) }));
    repository.getAiConfiguration.mockResolvedValue({ systemPrompt: "Responda em tom acolhedor, com objetividade e clareza para todas as pessoas." });
    repository.listReadyRegisteredWebDocuments.mockResolvedValue([]);
    externalSearch.crawlExternalEvidence.mockResolvedValue([]);
  });

  it("returns an explicitly ungrounded orientation when neither documents nor the web supply evidence", async () => {
    repository.searchReadyChunksWithDocuments.mockResolvedValue([]);
    llm.completeDocumentAnswer.mockResolvedValue("Ainda não há material interno disponível. Posso oferecer uma orientação geral, mas ela não representa regra da LibertyAI.");

    const result = await answerWithDocumentContext("Quais são os prazos de reembolso?");

    expect(result.hasContext).toBe(true);
    expect(result.sources).toEqual([]);
    expect(result.answer).toContain("Ainda não há material interno");
    expect(llm.completeDocumentAnswer).toHaveBeenCalledTimes(1);
    const messages = llm.completeDocumentAnswer.mock.calls[0][0];
    expect(messages[1].content).toContain("Nenhum trecho documental relevante");
    expect(messages[2].content).toContain("Nenhuma fonte externa");
  });

  it("labels retrieved PDFs as internal training context", async () => {
    repository.searchReadyChunksWithDocuments.mockResolvedValue([
      { chunkId: 1, documentId: 2, documentName: "Guia de cobertura.pdf", pageStart: 4, pageEnd: 4, sourceKind: "pdf", sourceAuthority: "internal_training", sourceGroup: "amil", effectiveAt: new Date("2024-01-01T00:00:00.000Z"), storageKey: "documents/guia.pdf", content: "O reembolso deve ser solicitado em até 30 dias após o atendimento." },
      { chunkId: 2, documentId: 3, documentName: "Outro documento.pdf", pageStart: 2, pageEnd: 2, sourceKind: "pdf", sourceAuthority: "internal_training", sourceGroup: "amil", effectiveAt: null, storageKey: "documents/outro.pdf", content: "Conteúdo sem relação com reembolso." },
    ]);
    llm.completeDocumentAnswer.mockResolvedValue("O pedido deve ser feito em até 30 dias após o atendimento.");

    const result = await answerWithDocumentContext("Qual é o prazo para solicitar reembolso?");

    expect(result.hasContext).toBe(true);
    expect(result.sources).toEqual([{ type: "document", documentId: 2, documentName: "Guia de cobertura.pdf", pageStart: 4, pageEnd: 4 }]);
    expect(llm.completeDocumentAnswer).toHaveBeenCalledTimes(1);
    const messages = llm.completeDocumentAnswer.mock.calls[0][0];
    expect(messages[0].content).toContain("nunca substituem silenciosamente");
    expect(messages[1].content).toContain("Guia de cobertura.pdf");
    expect(messages[1].content).toContain("Documento interno de treinamento");
    expect(externalSearch.crawlExternalEvidence).not.toHaveBeenCalled();
    expect(repository.listReadyRegisteredWebDocuments).not.toHaveBeenCalled();
  });

  it("uses external evidence when the indexed PDFs do not address the question", async () => {
    repository.searchReadyChunksWithDocuments.mockResolvedValue([]);
    repository.listReadyRegisteredWebDocuments.mockResolvedValue([{ id: 1, originalName: "Fonte oficial", storageKey: "https://example.org/reembolso", sourceGroup: "amil" }]);
    externalSearch.crawlExternalEvidence.mockResolvedValue([
      {
        type: "external",
        title: "Fonte oficial",
        url: "https://example.org/reembolso",
        domain: "example.org",
        content: "O prazo divulgado pela fonte oficial é de 30 dias.",
      },
    ]);
    llm.completeDocumentAnswer.mockResolvedValue("Segundo a fonte externa consultada, o prazo é de 30 dias.");

    const result = await answerWithDocumentContext("Qual é o prazo de reembolso?");
    expect(externalSearch.crawlExternalEvidence).toHaveBeenCalledWith("Qual é o prazo de reembolso?", ["https://www.gov.br/ans/", "https://example.org/reembolso"]);

    expect(result.sources).toEqual([
      { type: "external", title: "Fonte oficial", url: "https://example.org/reembolso", domain: "example.org" },
    ]);
    const messages = llm.completeDocumentAnswer.mock.calls[0][0];
    expect(messages[2].content).toContain("https://example.org/reembolso");
  });

  it("requires a first-attempt answer instead of clarifying questions when evidence supports a direct operator question", async () => {
    repository.searchReadyChunksWithDocuments.mockResolvedValue([]);
    repository.listReadyRegisteredWebDocuments.mockResolvedValue([{ id: 1, originalName: "Regra empresarial Amil", storageKey: "https://www.amil.example/regras", sourceGroup: "amil" }]);
    externalSearch.crawlExternalEvidence.mockResolvedValue([
      {
        type: "external",
        title: "Regra empresarial Amil",
        url: "https://www.amil.example/regras",
        domain: "amil.example",
        content: "Nos planos empresariais, a regra de idade deve ser conferida conforme o produto e o vínculo do dependente.",
      },
    ]);
    llm.completeDocumentAnswer.mockResolvedValue("A regra varia conforme o produto; a fonte empresarial consultada deve ser confirmada no contrato.");

    await answerWithDocumentContext("Até que idade a Amil aceita dependente?");

	    const messages = llm.completeDocumentAnswer.mock.calls[0][0];
	    expect(messages[0].content).toContain("RESPONDA NA PRIMEIRA TENTATIVA");
	    expect(messages[0].content).toContain("Nunca devolva somente perguntas");
	    expect(messages[0].content).toContain("Cite links das fontes externas usadas");
	    expect(messages[2].content).toContain("Regra empresarial Amil");
	    expect(messages[3].content).toContain("Responda agora em uma única tentativa");
	    expect(messages[3].content).toContain("Identifique as fontes usadas");
  });

  it("returns a registered URL page as a traceable list source", async () => {
    repository.searchReadyChunksWithDocuments.mockResolvedValue([
      { chunkId: 9, documentId: 8, documentName: "Orientações oficiais · example.gov", pageStart: 1, pageEnd: 1, sourceKind: "web", sourceAuthority: "official_registered", sourceGroup: "operadora-teste", effectiveAt: new Date("2026-01-01T00:00:00.000Z"), storageKey: "https://example.gov/orientacoes", content: "A orientação oficial prevê atualização anual do procedimento." },
    ]);
    llm.completeDocumentAnswer.mockResolvedValue("A página cadastrada informa atualização anual.");

    const result = await answerWithDocumentContext("Quando a orientação é atualizada?");

    expect(result.sources).toEqual([
      { type: "external", origin: "url-list", title: "Orientações oficiais · example.gov", url: "https://example.gov/orientacoes", domain: "example.gov" },
    ]);
    const messages = llm.completeDocumentAnswer.mock.calls[0][0];
    expect(messages[2].content).toContain("Página cadastrada");
    expect(messages[2].content).toContain("https://example.gov/orientacoes");
    expect(messages[2].content).toContain("Página cadastrada de fonte oficial");
  });

  it("preserves internal commercial evidence and requires explicit conflict disclosure", async () => {
    repository.searchReadyChunksWithDocuments.mockResolvedValue([
      { chunkId: 1, documentId: 2, documentName: "Treinamento Amil 2024.pdf", pageStart: 3, pageEnd: 3, sourceKind: "pdf", sourceAuthority: "internal_training", sourceGroup: "amil", effectiveAt: new Date("2024-01-01T00:00:00.000Z"), storageKey: "documents/amil-2024.pdf", content: "Vigência 2024: o prazo é de 30 dias." },
      { chunkId: 2, documentId: 3, documentName: "Página oficial Amil", pageStart: 1, pageEnd: 1, sourceKind: "web", sourceAuthority: "official_registered", sourceGroup: "amil", effectiveAt: new Date("2026-01-01T00:00:00.000Z"), storageKey: "https://www.amil.com.br/regras", content: "Atualizado em 2026: o prazo é de 45 dias." },
    ]);
    llm.completeDocumentAnswer.mockResolvedValue("A página oficial atualizada em 2026 indica 45 dias; o PDF interno de 2024 informa 30 dias.");

    await answerWithDocumentContext("Qual é o prazo vigente?");

    const messages = llm.completeDocumentAnswer.mock.calls[0][0];
    expect(messages[0].content).toContain("identifique as fontes e as datas/vigências declaradas");
    expect(messages[0].content).toContain("não houver vigência/versão suficiente");
    expect(messages[1].content).toContain("Treinamento Amil 2024.pdf");
    expect(messages[2].content).toContain("Página oficial Amil");
  });

  it("keeps internal evidence ahead of external sources even with a newer declared date", () => {
    const ranked = rankRelevantContext([
      { chunkId: 1, documentId: 1, documentName: "Treinamento Amil 2024.pdf", sourceKind: "pdf", sourceAuthority: "internal_training", sourceGroup: "amil", effectiveAt: new Date("2024-01-01T00:00:00.000Z"), storageKey: "documents/amil-2024.pdf", pageStart: 1, pageEnd: 1, content: "Prazo de 30 dias.", score: 3 },
      { chunkId: 2, documentId: 2, documentName: "Página oficial Amil", sourceKind: "web", sourceAuthority: "official_registered", sourceGroup: "amil", effectiveAt: new Date("2026-01-01T00:00:00.000Z"), storageKey: "https://www.amil.com.br/regras", pageStart: 1, pageEnd: 1, content: "Prazo de 45 dias.", score: 1 },
    ]);

    expect(ranked.map(chunk => chunk.documentName)).toEqual(["Treinamento Amil 2024.pdf", "Página oficial Amil"]);
  });

  it("does not let a source from another operator override the question relevance of a training document", () => {
    const ranked = rankRelevantContext([
      { chunkId: 1, documentId: 1, documentName: "Treinamento Amil 2024.pdf", sourceKind: "pdf", sourceAuthority: "internal_training", sourceGroup: "amil", effectiveAt: new Date("2024-01-01T00:00:00.000Z"), storageKey: "documents/amil-2024.pdf", pageStart: 1, pageEnd: 1, content: "Prazo de 30 dias.", score: 3 },
      { chunkId: 2, documentId: 2, documentName: "Página oficial Bradesco", sourceKind: "web", sourceAuthority: "official_registered", sourceGroup: "bradesco", effectiveAt: new Date("2026-01-01T00:00:00.000Z"), storageKey: "https://www.bradescosaude.com.br/regras", pageStart: 1, pageEnd: 1, content: "Prazo de 45 dias.", score: 1 },
    ]);

    expect(ranked.map(chunk => chunk.documentName)).toEqual(["Treinamento Amil 2024.pdf", "Página oficial Bradesco"]);
  });

  it("preserves the conversation history within the context budget", async () => {
    repository.searchReadyChunksWithDocuments.mockResolvedValue([]);
    llm.completeDocumentAnswer.mockResolvedValue("Resposta curta.");

    await answerWithDocumentContext("Continue a explicação", [
      { role: "user", content: "mensagem 1" },
      { role: "assistant", content: "mensagem 2" },
      { role: "user", content: "mensagem 3" },
      { role: "assistant", content: "mensagem 4" },
      { role: "user", content: "mensagem 5" },
    ]);

    const messages = llm.completeDocumentAnswer.mock.calls[0][0];
    expect(messages.slice(3, -1).map((message: { content: string }) => message.content)).toEqual(["mensagem 1", "mensagem 2", "mensagem 3", "mensagem 4", "mensagem 5"]);
  });
});

