import type { ChatAnswer } from "../models/liberty-ai.models";
import type { PolicyPage } from "./commercial-policy.service";

const plain = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const key = (value: string) =>
  plain(value)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export type WaitingTableCell = {
  procedure: string;
  description: string;
  column: string;
  value: string;
};

/** PDF pages may repeat headers horizontally and put all values on one line. */
function inlineWaitingTable(content: string): WaitingTableCell[] {
  let headers: string[] = [];
  let procedure = "";
  let description: string[] = [];
  const cells: WaitingTableCell[] = [];
  for (const line of content
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)) {
    if (/^(?:Colunas:\s*)?Grupos\b/i.test(line)) {
      headers = Array.from(
        line.matchAll(/Contratual|Promocional|Tabela\s+\d+/gi),
        match => match[0]
      );
      procedure = "";
      description = [];
      continue;
    }
    if (headers.length < 2) continue;
    const start = line.match(/^(G\d+)\b\s*(.*)/i);
    const preexisting = /^doenca.*preexist/.test(key(line));
    let rest = line;
    if (start || preexisting) {
      const valueStart = line.search(/\b\d+\s+(?:dias?|horas?)\b/i);
      procedure = start
        ? `${start[1]}${start[2] && !/^\d+\s/.test(start[2]) ? ` — ${start[2].slice(0, 80)}` : ""}`
        : valueStart < 0
          ? line
          : line.slice(0, valueStart).trim();
      description = [valueStart < 0 ? line : line.slice(0, valueStart).trim()];
      rest = valueStart < 0 ? "" : line.slice(valueStart);
    }
    if (!procedure) continue;
    const values = Array.from(
      rest.matchAll(/\b\d+\s+(?:dias?|horas?)\b/gi),
      match => match[0]
    );
    if (
      values.length &&
      !rest.replace(/\b\d+\s+(?:dias?|horas?)\b/gi, "").trim()
    ) {
      if (values.length === headers.length)
        cells.push(
          ...headers.map((column, index) => ({
            procedure,
            description: description.join(" "),
            column,
            value: values[index]!,
          }))
        );
      procedure = "";
      description = [];
    } else if (!start && !preexisting) description.push(line);
  }
  return cells;
}

/** Never infer column positions from a partial table or unequal cell counts. */
export function explicitWaitingTable(content: string): {
  content: string;
  cells: WaitingTableCell[];
} {
  const inline = inlineWaitingTable(content);
  if (inline.length)
    return {
      content: `${content}\n\nAssociação explícita de colunas desta página:\n${inline.map(cell => `${cell.procedure} | ${cell.column}: ${cell.value}`).join("\n")}`,
      cells: inline,
    };
  const lines = content
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);
  const first = lines.findIndex(line => key(line) === "contratual");
  if (first < 0) return { content, cells: [] };
  let cursor = first;
  const headers: string[] = [];
  while (
    cursor < lines.length &&
    /^(contratual|promocional|tabela \d+)$/.test(key(lines[cursor]!))
  )
    headers.push(lines[cursor++]!);
  if (headers.length < 3) return { content, cells: [] };
  const starts = lines.flatMap((line, i) =>
    i >= cursor && (/^G\d+$/i.test(line) || /^doenca.*preexist/.test(key(line)))
      ? [i]
      : []
  );
  if (!starts.length) return { content, cells: [] };
  const cells: WaitingTableCell[] = [];
  for (let i = 0; i < starts.length; i++) {
    const row = lines.slice(starts[i], starts[i + 1] ?? lines.length);
    const start = row.findIndex(line => /^\d+\s*(dias?|horas?)$/i.test(line));
    if (
      start < 1 ||
      row.length - start !== headers.length ||
      row.slice(start).some(line => !/^\d+\s*(dias?|horas?)$/i.test(line))
    )
      return { content, cells: [] };
    const procedure =
      row[0]! +
      (/^G\d+$/i.test(row[0]!) && start > 1
        ? ` — ${row[1]!.slice(0, 80)}`
        : "");
    const description = row.slice(0, start).join(" ");
    cells.push(
      ...headers.map((column, index) => ({
        procedure,
        description,
        column,
        value: row[start + index]!,
      }))
    );
  }
  const rows = Array.from(new Set(cells.map(cell => cell.procedure))).map(
    procedure => {
      const group = cells.filter(cell => cell.procedure === procedure);
      return `${group[0]!.description}\n${group.map(cell => `${cell.column}: ${cell.value}`).join(" | ")}`;
    }
  );
  return {
    content: `${lines.slice(0, first).join("\n")}\nTabela com colunas explícitas:\n${rows.join("\n")}`,
    cells,
  };
}

function result(page: PolicyPage, text: string): ChatAnswer {
  return {
    answer: `${text}\n\n(${page.documentName}, página ${page.pageStart}.)`,
    hasContext: true,
    sources: [
      {
        type: "document",
        documentId: page.documentId,
        documentName: page.documentName,
        pageStart: page.pageStart,
        pageEnd: page.pageEnd,
      },
    ],
  };
}

/** Denials derive from an explicit reduction limit, not enrollment/pricing ages. */
export function directEvidenceLimitAnswer(
  question: string,
  pages: PolicyPage[]
): ChatAnswer | null {
  const q = key(question);
  if (
    !/carencia|preexist|\bcpt\b/.test(q) ||
    new Set(pages.map(page => page.documentId)).size !== 1
  )
    return null;
  const ages = Array.from(
    q.matchAll(
      /\b(?:com|tenho|idade de|funcionario de|beneficiario de) (\d{1,3}) anos\b/g
    )
  );
  const age = ages.at(-1);
  // A period in the previous plan is not the beneficiary's age.
  if (
    age &&
    !/\banos (?:e )?\d+ meses|\banos (?:de|no|na|em)\b/.test(q.slice(age.index))
  ) {
    const rules: Array<{ page: PolicyPage; years: number; quote: string }> = [];
    for (const page of pages) {
      for (const line of page.content.split("\n")) {
        const text = key(line);
        const global = /^reducao (?:de carencia )?para beneficiarios ate /.test(
          text
        );
        const employee = /funcionario/.test(q)
          ? text.match(
              /(?:ate|limite(?: de idade)?(?: e| de)?) (\d+) anos(?: \d+ meses)?(?: e)?(?: \d+ dias)? para funcionarios/
            )
          : null;
        const maximum = global ? text.match(/ate (\d+) anos/) : employee;
        if (maximum)
          rules.push({ page, years: Number(maximum[1]), quote: line.trim() });
      }
    }
    if (rules.length && rules.every(rule => Number(age[1]) > rule.years)) {
      const rule = rules[0]!;
      return result(
        rule.page,
        `Com ${Number(age[1])} anos, o limite expresso para redução de carência foi ultrapassado. A fonte estabelece: “${rule.quote}”\n\nIsso trata da redução de carência, não da possibilidade geral de contratar o plano.`
      );
    }
  }
  const elapsed = q.match(/ultimo vencimento pago (?:foi )?ha (\d+) dias/);
  if (elapsed) {
    const rules = pages.flatMap(page =>
      page.content.split("\n").flatMap(line => {
        const match = key(line).match(
          /nao pode ultrapassar (\d+) dias do ultimo vencimento pago/
        );
        return match
          ? [{ page, days: Number(match[1]), quote: line.trim() }]
          : [];
      })
    );
    if (rules.length && rules.every(rule => Number(elapsed[1]) > rule.days))
      return result(
        rules[0]!.page,
        `O prazo informado ultrapassa a janela de ${rules[0]!.days} dias desde o último vencimento pago: “${rules[0]!.quote}” A alternativa de contagem pela exclusão, quando aplicável, precisa ser conferida separadamente.`
      );
  }
  return null;
}

export function directExplicitTableAnswer(
  question: string,
  pages: PolicyPage[]
): ChatAnswer | null {
  const q = key(question);
  if (
    !/carencia|\bcpt\b|preexist/.test(q) ||
    /documentos|documentacao|requisitos|permanencia|minimo|idade|como funciona|\b(?:com|tenho) \d+/.test(
      q
    ) ||
    new Set(pages.map(page => page.documentId)).size !== 1
  )
    return null;
  const requested = [
    q.includes("parto") ? "parto" : null,
    /preexist|\bcpt\b/.test(q) ? "preexist" : null,
  ].filter((value): value is string => !!value);
  if (!requested.length) return null;
  if (pages.some(page => page.content.split("\n").some(line => /preexist|\bcpt\b/.test(plain(line)) && /aproveit|isen|dispens|cumprid/.test(plain(line))))) return null;
  const parsedPages = pages.map(page => ({
    page,
    cells: explicitWaitingTable(page.content).cells,
  }));
  const labels = new Map<string, Set<string>>();
  for (const { cells } of parsedPages)
    for (const cell of cells)
      if (/^G\d+ — /i.test(cell.procedure)) {
        const code = cell.procedure.split(" ")[0]!;
        const names = labels.get(code) ?? new Set<string>();
        names.add(cell.procedure);
        labels.set(code, names);
      }
  const groupLabels = new Map(
    Array.from(labels).flatMap(([code, names]) =>
      names.size === 1 ? [[code, Array.from(names)[0]!] as const] : []
    )
  );
  // A repeated group code on a continuation retains its descriptor from this
  // same document; it never borrows labels across products or documents.
  const allCells = parsedPages.flatMap(({ page, cells }) =>
    cells.map(cell => ({
      ...cell,
      procedure: groupLabels.get(cell.procedure) ?? cell.procedure,
      page,
    }))
  );
  const summary: string[] = [];
  const used: PolicyPage[] = [];
  for (const term of requested) {
    let cells = allCells.filter(cell =>
      term === "parto"
        ? /\bparto\b/.test(key(cell.procedure))
        : /^doenca.*preexist/.test(key(cell.procedure))
    );
    if (/tabela/.test(q))
      cells = cells.filter(cell => /^tabela /.test(key(cell.column)));
    const interval = q.match(/tabelas? (\d+) (?:a|ate) (\d+)/);
    const specific = q.match(/tabelas? (\d+)/);
    if (interval)
      cells = cells.filter(cell => {
        const n = Number(key(cell.column).split(" ").at(-1));
        return n >= Number(interval[1]) && n <= Number(interval[2]);
      });
    else if (specific) {
      if (/tabelas? \d+ (?:e|,)/.test(q)) return null;
      cells = cells.filter(
        cell =>
          Number(key(cell.column).split(" ").at(-1)) === Number(specific[1])
      );
    }
    if (!cells.length) break;
    if (
      interval &&
      Array.from(
        {
          length: Math.min(
            100,
            Math.max(0, Number(interval[2]) - Number(interval[1]) + 1)
          ),
        },
        (_, i) => Number(interval[1]) + i
      ).some(
        n =>
          !cells.some(cell => Number(key(cell.column).split(" ").at(-1)) === n)
      )
    )
      return null;
    const byColumn = new Map<string, string>();
    for (const cell of cells) {
      const prior = byColumn.get(key(cell.column));
      if (prior && prior !== cell.value) return null;
      byColumn.set(key(cell.column), cell.value);
      used.push(cell.page);
    }
    const unique = Array.from(
      new Map(cells.map(cell => [key(cell.column), cell])).values()
    );
    summary.push(
      `${term === "parto" ? "Parto" : "Doenças/lesões preexistentes"}: ${new Set(unique.map(cell => cell.value)).size === 1 ? `${unique[0]!.value} (${unique.map(cell => cell.column).join(", ")})` : unique.map(cell => `${cell.column}: ${cell.value}`).join("; ")}.`
    );
  }
  if (summary.length === requested.length) {
    const sourcePages = Array.from(
      new Map(used.map(page => [page.pageStart, page])).values()
    );
    const response = result(sourcePages[0]!, summary.join("\n"));
    response.sources = sourcePages.flatMap(page => result(page, "").sources);
    response.answer =
      summary.join("\n") +
      `\n\n(${sourcePages[0]!.documentName}, páginas ${sourcePages.map(page => page.pageStart).join(", ")}.)`;
    return response;
  }
  return null;
}
