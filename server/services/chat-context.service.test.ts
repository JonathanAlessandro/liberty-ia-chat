import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  getAiConfiguration: vi.fn(),
  searchReadyChunksWithDocuments: vi.fn(),
  listReadyRegisteredWebDocuments: vi.fn(),
}));
const llm = vi.hoisted(() => ({ completeDocumentAnswer: vi.fn() }));
const externalSearch = vi.hoisted(() => ({ crawlExternalEvidence: vi.fn() }));

vi.mock("../repositories/document.repository", () => repository);
vi.mock("./llm.service", () => llm);
vi.mock("./external-search.service", () => externalSearch);

import { answerWithDocumentContext, rankRelevantContext } from "./chat-context.service";

describe("answerWithDocumentContext", () => {
  it("keeps the exact procedure ahead of similar words for the reported question", async () => {
    const base = { documentName: "Omint reembolso.pdf", pageStart: 1, pageEnd: 1, sourceKind: "pdf", sourceAuthority: "internal_training", sourceGroup: "omint", effectiveAt: null, storageKey: "documents/table.pdf" };
    repository.searchReadyChunksWithDocuments.mockResolvedValue([
      ...Array.from({ length: 6 }, (_, i) => ({ ...base, chunkId: i, documentId: i, content: "Psicologia reembolso 100,00" })),
      { ...base, chunkId: 10, documentId: 10, content: "Reembolso\nVigência: 01/01/2025\nLinha: Psicoterapia por sessão\nColuna 16: 194,53" },
    ]);
    llm.completeDocumentAnswer.mockResolvedValue("Para o código 16, R$ 194,53; a equivalência com C16 não foi confirmada.");
    await answerWithDocumentContext("qual reembolso para psicoterapia categoria c16 da omint?");
    const messages = llm.completeDocumentAnswer.mock.calls[0][0];
    expect(messages[1].content).toContain("Coluna 16: 194,53");
    expect(messages[0].content).toContain("Não declare equivalência entre códigos sem evidência");
    expect(externalSearch.crawlExternalEvidence).not.toHaveBeenCalled();
  });
  it("searches short numeric codes and keeps longer identifiers intact", async () => {
    repository.searchReadyChunksWithDocuments.mockResolvedValue([]);
    repository.getAiConfiguration.mockResolvedValue({ systemPrompt: "Teste" });
    repository.listReadyRegisteredWebDocuments.mockResolvedValue([]);
    externalSearch.crawlExternalEvidence.mockResolvedValue([]);
    llm.completeDocumentAnswer.mockResolvedValue("Resposta");
    await answerWithDocumentContext("psicoterapia 16 C123456");
    expect(repository.searchReadyChunksWithDocuments).toHaveBeenCalledWith(["psico", "16", "c123456"]);
  });
  beforeEach(() => {
    vi.resetAllMocks();
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
    expect(messages[0].content).toContain("não prevalecem automaticamente");
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
    expect(externalSearch.crawlExternalEvidence).toHaveBeenCalledWith("Qual é o prazo de reembolso?", ["https://example.org/reembolso"]);

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
	    expect(messages[0].content).toContain("Nunca exponha a proveniência ao usuário final");
	    expect(messages[2].content).toContain("Regra empresarial Amil");
	    expect(messages[3].content).toContain("Responda agora em uma única tentativa");
	    expect(messages[3].content).toContain("Não exponha fontes, documentos, links ou páginas ao usuário");
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

  it("instructs the model to prefer a newer official registered page over an older conflicting training PDF", async () => {
    repository.searchReadyChunksWithDocuments.mockResolvedValue([
      { chunkId: 1, documentId: 2, documentName: "Treinamento Amil 2024.pdf", pageStart: 3, pageEnd: 3, sourceKind: "pdf", sourceAuthority: "internal_training", sourceGroup: "amil", effectiveAt: new Date("2024-01-01T00:00:00.000Z"), storageKey: "documents/amil-2024.pdf", content: "Vigência 2024: o prazo é de 30 dias." },
      { chunkId: 2, documentId: 3, documentName: "Página oficial Amil", pageStart: 1, pageEnd: 1, sourceKind: "web", sourceAuthority: "official_registered", sourceGroup: "amil", effectiveAt: new Date("2026-01-01T00:00:00.000Z"), storageKey: "https://www.amil.com.br/regras", content: "Atualizado em 2026: o prazo é de 45 dias." },
    ]);
    llm.completeDocumentAnswer.mockResolvedValue("A página oficial atualizada em 2026 indica 45 dias; o PDF interno de 2024 informa 30 dias.");

    await answerWithDocumentContext("Qual é o prazo vigente?");

    const messages = llm.completeDocumentAnswer.mock.calls[0][0];
    expect(messages[0].content).toContain("vigência, atualização ou versão comprovadamente mais recente");
    expect(messages[0].content).toContain("não houver vigência/versão suficiente");
    expect(messages[1].content).toContain("Treinamento Amil 2024.pdf");
    expect(messages[2].content).toContain("Página oficial Amil");
  });

  it("orders a newer official source ahead of an older training source from the same operator before the model is called", () => {
    const ranked = rankRelevantContext([
      { chunkId: 1, documentId: 1, documentName: "Treinamento Amil 2024.pdf", sourceKind: "pdf", sourceAuthority: "internal_training", sourceGroup: "amil", effectiveAt: new Date("2024-01-01T00:00:00.000Z"), storageKey: "documents/amil-2024.pdf", pageStart: 1, pageEnd: 1, content: "Prazo de 30 dias.", score: 3 },
      { chunkId: 2, documentId: 2, documentName: "Página oficial Amil", sourceKind: "web", sourceAuthority: "official_registered", sourceGroup: "amil", effectiveAt: new Date("2026-01-01T00:00:00.000Z"), storageKey: "https://www.amil.com.br/regras", pageStart: 1, pageEnd: 1, content: "Prazo de 45 dias.", score: 1 },
    ]);

    expect(ranked.map(chunk => chunk.documentName)).toEqual(["Página oficial Amil", "Treinamento Amil 2024.pdf"]);
  });

  it("does not let a source from another operator override the question relevance of a training document", () => {
    const ranked = rankRelevantContext([
      { chunkId: 1, documentId: 1, documentName: "Treinamento Amil 2024.pdf", sourceKind: "pdf", sourceAuthority: "internal_training", sourceGroup: "amil", effectiveAt: new Date("2024-01-01T00:00:00.000Z"), storageKey: "documents/amil-2024.pdf", pageStart: 1, pageEnd: 1, content: "Prazo de 30 dias.", score: 3 },
      { chunkId: 2, documentId: 2, documentName: "Página oficial Bradesco", sourceKind: "web", sourceAuthority: "official_registered", sourceGroup: "bradesco", effectiveAt: new Date("2026-01-01T00:00:00.000Z"), storageKey: "https://www.bradescosaude.com.br/regras", pageStart: 1, pageEnd: 1, content: "Prazo de 45 dias.", score: 1 },
    ]);

    expect(ranked.map(chunk => chunk.documentName)).toEqual(["Treinamento Amil 2024.pdf", "Página oficial Bradesco"]);
  });

  it("sends only the three most recent history messages to the model", async () => {
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
    expect(messages.slice(3, -1).map((message: { content: string }) => message.content)).toEqual(["mensagem 3", "mensagem 4", "mensagem 5"]);
  });
});
