import { describe, expect, it } from "vitest";
import {
  directEvidenceLimitAnswer,
  directExplicitTableAnswer,
  explicitWaitingTable,
} from "./evidence-rules";
const page = (content: string) => ({
  documentId: 1,
  documentName: "Painel_teste-pme.pdf",
  sourceKind: "pdf",
  pageStart: 2,
  pageEnd: 2,
  content,
});
const table = [
  "Carências",
  "Redução para beneficiários até 65 anos 11 meses e 29 dias",
  "Contratual",
  "Promocional",
  "Tabela 01",
  "Tabela 02",
  "Tabela 03",
  "G0",
  "URGÊNCIA E EMERGÊNCIAS",
  ...Array(5).fill("24 horas"),
  "G5",
  "PARTO a termo, exceto situações expressamente descritas nas notas.",
  ...Array(5).fill("300 dias"),
  "Doença(s) e Lesão(ões) Preexistentes",
  ...Array(5).fill("720 dias"),
].join("\n");
describe("evidence-derived limits and tables", () => {
  it("respects the age boundary without confusing previous membership", () => {
    expect(
      directEvidenceLimitAnswer("Com 66 anos consigo reduzir carência?", [
        page(table),
      ])?.answer
    ).toContain("ultrapassado");
    for (const question of [
      "Com 65 anos consigo reduzir carência?",
      "Tenho 66 anos de plano. Posso reduzir carência?",
      "Com 65 anos e 11 meses posso reduzir carência?",
    ])
      expect(directEvidenceLimitAnswer(question, [page(table)])).toBeNull();
    expect(
      directEvidenceLimitAnswer("Com 66 anos consigo reduzir carência?", [
        page(table),
        { ...page(table), documentId: 2 },
      ])
    ).toBeNull();
  });
  it("does not borrow the partner limit for an employee", () => {
    const text =
      "Carências\nA idade limite para aproveitamento de carências é de 69 anos 11 meses e 29 dias para sócios e cônjuges e até 58 anos 11 meses e 29 dias para funcionários e cônjuges;";
    expect(
      directEvidenceLimitAnswer(
        "Funcionário de 60 anos consegue reduzir carência?",
        [page(text)]
      )?.answer
    ).toContain("ultrapassado");
    expect(
      directEvidenceLimitAnswer(
        "Sócio com 60 anos consegue reduzir carência?",
        [page(text)]
      )
    ).toBeNull();
  });
  it("keeps the last-paid due date distinct from cancellation", () => {
    const text =
      "Carências\nPara análise de redução de carência não pode ultrapassar 60 dias do último vencimento pago ou 60 dias da exclusão da empresa.";
    expect(
      directEvidenceLimitAnswer(
        "Redução de carência: último vencimento pago há 61 dias",
        [page(text)]
      )?.answer
    ).toContain("ultrapassa");
    expect(
      directEvidenceLimitAnswer(
        "Redução de carência: último vencimento pago há 60 dias",
        [page(text)]
      )
    ).toBeNull();
    expect(
      directEvidenceLimitAnswer(
        "Cancelei há 61 dias, posso reduzir carência?",
        [page(text)]
      )
    ).toBeNull();
  });
  it("only maps complete tables and preserves descriptions", () => {
    const result = explicitWaitingTable(table);
    expect(result.cells).toHaveLength(15);
    expect(result.content).toContain("exceto situações");
    expect(
      result.cells
        .filter(c => c.procedure.includes("PARTO"))
        .every(c => c.value === "300 dias")
    ).toBe(true);
    expect(explicitWaitingTable(table.replace(/720 dias$/, "")).cells).toEqual(
      []
    );
  });
  it("answers only the requested table interval", () => {
    const result = directExplicitTableAnswer(
      "Qual a carência de parto e preexistentes nas tabelas 01 a 02?",
      [page(table)]
    );
    expect(result?.answer).toContain("300 dias");
    expect(result?.answer).toContain("720 dias");
    expect(result?.answer).not.toContain("Tabela 03");
    expect(
      directExplicitTableAnswer(
        "Como funciona redução de carência, documentos e parto?",
        [page(table)]
      )
    ).toBeNull();
    expect(directExplicitTableAnswer('Qual a carência para preexistentes?', [page(table+'\nOrigem no próprio grupo: aproveitamento da CPT cumprida.')])).toBeNull();
  });
  it("joins explicit continuation columns with original source pages", () => {
    const pages = [
      page(
        "Grupos Procedimentos Contratual Tabela 01\nG5 PARTO\n300 dias 300 dias\nDoença(s) e Lesão(ões) Preexistentes\n720 dias 720 dias"
      ),
      {
        ...page(
          "Grupos Tabela 02 Tabela 03\nG5 300 dias 300 dias\nDoença(s) e Lesão(ões) Preexistentes 720 dias 720 dias"
        ),
        pageStart: 3,
        pageEnd: 3,
      },
    ];
    const result = directExplicitTableAnswer(
      "Qual a carência de parto e preexistentes nas tabelas 01 a 03?",
      pages
    );
    expect(result?.answer).toContain("300 dias");
    expect(result?.answer).toContain("720 dias");
    expect(result?.sources).toHaveLength(2);
    expect(
      directExplicitTableAnswer(
        "Qual a carência de parto nas tabelas 01 a 04?",
        pages
      )
    ).toBeNull();
    expect(
      directExplicitTableAnswer(
        "Qual a carência de parto nas tabelas 01 a 03?",
        [
          ...pages,
          {
            ...pages[1]!,
            content: pages[1]!.content.replace("G5 300 dias", "G5 100 dias"),
          },
        ]
      )
    ).toBeNull();
  });
});
