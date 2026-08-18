import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  getAiConfiguration: vi.fn(),
  getReadyChunksWithDocuments: vi.fn(),
}));
const llm = vi.hoisted(() => ({ completeDocumentAnswer: vi.fn() }));
const externalSearch = vi.hoisted(() => ({ searchExternalEvidence: vi.fn() }));

vi.mock("../repositories/document.repository", () => repository);
vi.mock("./llm.service", () => llm);
vi.mock("./external-search.service", () => externalSearch);

import { answerWithDocumentContext } from "./chat-context.service";

describe("answerWithDocumentContext", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    repository.getAiConfiguration.mockResolvedValue({ systemPrompt: "Responda em tom acolhedor, com objetividade e clareza para todas as pessoas." });
    externalSearch.searchExternalEvidence.mockResolvedValue([]);
  });

  it("does not call the model when neither documents nor the web supply evidence", async () => {
    repository.getReadyChunksWithDocuments.mockResolvedValue([
      { chunkId: 1, documentId: 2, documentName: "Manual.pdf", pageStart: 1, pageEnd: 1, content: "Política de privacidade e segurança." },
    ]);

    const result = await answerWithDocumentContext("Quais são os prazos de reembolso?");

    expect(result.hasContext).toBe(false);
    expect(result.sources).toEqual([]);
    expect(result.answer).toContain("Não encontrei informação suficiente");
    expect(llm.completeDocumentAnswer).not.toHaveBeenCalled();
  });

  it("sends retrieved document text as the priority context", async () => {
    repository.getReadyChunksWithDocuments.mockResolvedValue([
      { chunkId: 1, documentId: 2, documentName: "Guia de cobertura.pdf", pageStart: 4, pageEnd: 4, content: "O reembolso deve ser solicitado em até 30 dias após o atendimento." },
      { chunkId: 2, documentId: 3, documentName: "Outro documento.pdf", pageStart: 2, pageEnd: 2, content: "Conteúdo sem relação com reembolso." },
    ]);
    llm.completeDocumentAnswer.mockResolvedValue("O pedido deve ser feito em até 30 dias após o atendimento.");

    const result = await answerWithDocumentContext("Qual é o prazo para solicitar reembolso?");

    expect(result.hasContext).toBe(true);
    expect(result.sources).toEqual([{ type: "document", documentId: 2, documentName: "Guia de cobertura.pdf", pageStart: 4, pageEnd: 4 }]);
    expect(llm.completeDocumentAnswer).toHaveBeenCalledTimes(1);
    const messages = llm.completeDocumentAnswer.mock.calls[0][0];
    expect(messages[0].content).toContain("Os trechos de PDF são a fonte prioritária");
    expect(messages[1].content).toContain("Guia de cobertura.pdf");
  });

  it("uses external evidence when the indexed PDFs do not address the question", async () => {
    repository.getReadyChunksWithDocuments.mockResolvedValue([]);
    externalSearch.searchExternalEvidence.mockResolvedValue([
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

    expect(result.sources).toEqual([
      { type: "external", title: "Fonte oficial", url: "https://example.org/reembolso", domain: "example.org" },
    ]);
    const messages = llm.completeDocumentAnswer.mock.calls[0][0];
    expect(messages[2].content).toContain("https://example.org/reembolso");
  });
});
