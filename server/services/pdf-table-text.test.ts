import { describe, expect, it } from "vitest";
import { numericTableSections } from "./pdf-table-text";

describe("numeric PDF tables", () => {
  it("keeps procedure, short column codes, values and validity together", () => {
    const rows = numericTableSections("Exemplos de reembolso\nVigência: 01/01/2025\nDespesas: 15 16 17/19 SC1\nPsicoterapia por sessão 146,23 194,53 206,51 83,14");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("Vigência: 01/01/2025");
    expect(rows[0]).toContain("Linha: Psicoterapia por sessão\nColuna 15: 146,23\nColuna 16: 194,53\nColuna 17/19: 206,51");
  });

  it("works with unrelated products and replaces section headers", () => {
    const rows = numericTableSections("Preços\nPacotes: A1 B2\nEntrega expressa 10,00 20,00\nPacotes: X3 Y4\nEntrega normal 5,00 -");
    expect(rows[1]).toContain("Coluna X3: 5,00\nColuna Y4: -");
    expect(rows[1]).not.toContain("Coluna A1");
  });

  it("does not guess missing or extra cells or carry columns across prose", () => {
    for (const row of ["Serviço 10,00", "Serviço 10,00 20,00 30,00", "Nota explicativa\nServiço 10,00 20,00"]) {
      expect(numericTableSections(`Planos: 15 16\n${row}`)).toEqual([]);
    }
  });

  it("leaves ordinary prose alone", () => {
    expect(numericTableSections("Manual\nSolicite o reembolso em até 30 dias.")).toEqual([]);
  });
});
