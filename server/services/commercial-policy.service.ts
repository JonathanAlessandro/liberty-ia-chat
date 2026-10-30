import type { ChatAnswer, SourceReference } from "../models/liberty-ai.models";

export type PolicyPage = {
  documentId: number; documentName: string; sourceKind: string;
  pageStart: number; pageEnd: number; content: string;
};
const plain = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const compact = (text: string) => text.replace(/\s+/g, " ").trim();
function reference(page: PolicyPage): SourceReference {
  return { type: "document", documentId: page.documentId, documentName: page.documentName, pageStart: page.pageStart, pageEnd: page.pageEnd };
}
function answer(rows: Array<{ page: PolicyPage; text: string }>, suffix: string): ChatAnswer {
  return {
    answer: rows.map(({ page, text }) => `${text}\n\n(${page.documentName}, página ${page.pageStart}.)`).join("\n\n") + (suffix ? `\n\n${suffix}` : ""),
    sources: Array.from(new Map(rows.map(row => [`${row.page.documentId}:${row.page.pageStart}`, reference(row.page)])).values()), hasContext: true,
  };
}
function documents(pages: PolicyPage[]) {
  return Array.from(new Set(pages.map(page => page.documentId))).map(id => pages.filter(page => page.documentId === id));
}
const label = (page: PolicyPage) => /(?:^|[-_])pf(?:[-_.]|$)/i.test(page.documentName) ? "PF / individual"
  : /(?:^|[-_])pme(?:[-_.]|$)/i.test(page.documentName) ? "PME / empresarial" : page.documentName;

/** Narrow, evidence-derived answers. No operator names, ages or commercial deadlines are hardcoded. */
export function directCommercialAnswer(question: string, resolvedQuestion: string, pages: PolicyPage[]): ChatAnswer | null {
  if (!pages.length || pages.some(page => page.sourceKind !== "pdf")) return null;
  const query = plain(question);
  const resolved = plain(resolvedQuestion);
  const groups = documents(pages);
  const months = Array.from(resolved.matchAll(/\b(\d+)\s+meses\b/g)).at(-1)?.[1];
  const duration = months === undefined ? undefined : Number(months);
  const otherTopic = /parto|\bcpt\b|preexist|document|terapia|idade|\banos\b|\bsenior\b|funcionari[oa] public/.test(query);
  const modalityClarification = /\b(pme|empresarial|pf|individual)\b/.test(query) && !/\d/.test(query) && query.length < 40;

  // Each modality must supply its own deadline and its own temporal anchor.
  const cancelled = resolved.match(/cancel\w*\s+(?:\w+\s+){0,4}?ha\s+(\d+)\s+dias/);
  const returnToSamePlan = /voltar|retorn|ex.benefici|mesm[oa]|propri[oa]/.test(resolved) || Boolean(cancelled && groups.some(group => {
    const brand = plain(group[0]!.documentName).match(/^painel_(.+?)-(?:pf|pme)(?:_|\.)/)?.[1]?.replace(/[-_]/g, " ");
    return brand && plain(cancelled[0]).includes(brand);
  }));
  if (cancelled && !returnToSamePlan && !otherTopic && (/cancel/.test(query) || modalityClarification)) {
    const rows = groups.map(group => {
      const matches = group.flatMap(page => {
        const text = compact(page.content);
        const normalized = plain(text);
        const pattern = /(?:o plano anteriormente contratado|o plano anterior) deve estar ativo ou ter sido cancelado ha,? (?:no maximo,? )?(\d+) dias[^.]*\./g;
        return Array.from(normalized.matchAll(pattern), match => ({ page, days: Number(match[1]), quote: text.slice(match.index, match.index! + match[0].length) }));
      });
      if (matches.length !== 1) return null;
      const rule = matches[0]!;
      const elapsed = Number(cancelled[1]);
      return { page: rule.page, text: `**${label(rule.page)}:** ${elapsed} dias ${elapsed <= rule.days ? `estão dentro da janela de ${rule.days} dias; o cancelamento informado, por si só, não impede a análise` : `ultrapassam a janela de ${rule.days} dias para redução`}. A fonte define o marco assim: “${rule.quote}”` };
    });
    if (rows.every(row => row !== null)) return answer(rows, "Isso responde ao prazo desde o cancelamento. Os demais critérios continuam sujeitos à documentação e à análise; não significa aprovação automática.");
  }
  if (duration === undefined || otherTopic) return null;

  // Keep the column attached to its own document. PF column 2 is not PME column 1.
  const columns = groups.map(group => {
    const matches = group.flatMap(page => {
      const text = compact(page.content);
      return Array.from(plain(text).matchAll(/coluna\s+(\d+)\s*[-–]\s*valida? para beneficiarios com permanencia de\s+(\d+)\s+a\s+(\d+)\s+meses no plano anterior\.?/g), match => ({ page, column: match[1], min: Number(match[2]), max: Number(match[3]), quote: text.slice(match.index, match.index! + match[0].length) }));
    }).filter(rule => duration >= rule.min && duration <= rule.max);
    return matches.length === 1 ? matches[0]! : null;
  });
  if (columns.every(rule => rule !== null)) return answer(columns.map(rule => ({ page: rule.page, text: `**${label(rule.page)}:** ${duration} meses se enquadram na **Coluna ${rule.column}**. “${rule.quote}”` })), "O enquadramento por permanência permite analisar a redução, mas não zera todos os procedimentos nem dispensa os demais critérios.");

  if (/nao (?:e |sao )?congener/.test(query) && groups.length === 1) {
    const rules = pages.flatMap(page => {
      const text = compact(page.content);
      return Array.from(plain(text).matchAll(/parcial\s*[-–]\s*valido para empresas advindas de operadoras nao congeneres a partir de\s+(\d+)\s+meses[^;]*;/g), match => ({ page, minimum: Number(match[1]), quote: text.slice(match.index, match.index! + match[0].length) }));
    });
    if (rules.length === 1) {
      const rule = rules[0]!;
      return answer([{ page: rule.page, text: duration >= rule.minimum
        ? `Com ${duration} meses em operadora não congênere, o requisito de permanência permite **redução parcial**. A regra é “a partir de ${rule.minimum} meses”; esse critério não estabelece um teto de permanência.\n\n“${rule.quote}”`
        : `Com ${duration} meses, o requisito de permanência para redução parcial ainda não é atingido: a fonte exige a partir de ${rule.minimum} meses.\n\n“${rule.quote}”` }], "Essa é a regra de permanência, não uma garantia de aprovação. Os demais critérios precisam ser atendidos.");
    }
  }

  // The catalog identifies the destination, but does not prove whether the
  // particular origin plan is compatible. Present both documented PRC paths.
  if (groups.length === 1) {
    const paths: Array<{ page: PolicyPage; code: string; origin: string; clause: string }> = [];
    for (const page of pages) {
      const text = compact(page.content);
      for (const block of Array.from(text.matchAll(/PRC\s*(\d+)\s*[-–]\s*([\s\S]*?)(?=PRC\s*\d+\s*[-–]|Para consultar|Para a junção|Documentos|$)/gi))) {
        for (const clause of block[2]!.split(/;\s*ou que/i)) {
          const normalized = plain(clause);
          const range = normalized.match(/por periodo de\s+(\d+)\s+a\s+(\d+)\s+meses/);
          const above = normalized.match(/por periodo superior a\s+(\d+)\s+meses/);
          if (!(range && duration >= Number(range[1]) && duration <= Number(range[2])) && !(above && duration > Number(above[1]))) continue;
          const origin = /excecao das congeneres/.test(normalized) ? "não congênere" : /operadoras congeneres/.test(normalized) ? "congênere compatível" : undefined;
          if (origin) paths.push({ page, code: block[1]!, origin, clause: compact(clause) });
        }
      }
    }
    if (paths.length === 2 && new Set(paths.map(path => path.origin)).size === 2) return answer(paths.map(path => ({ page: path.page, text: `Com ${duration} meses, se o plano anterior for **${path.origin}**, a faixa corresponde ao **PRC ${path.code}**.\n\n“${path.clause}”` })), "Não confirmei a compatibilidade do plano de origem na relação de congêneres. Por isso, não vou classificá-lo por suposição. Os prazos por procedimento dependem do PRC aplicável e dos demais requisitos.");
  }
  return null;
}

export function directAccompaniedChildAnswer(question: string, pages: PolicyPage[]): ChatAnswer | null {
  const query = plain(question);
  if (!/filh|crianca|menor/.test(query) || /carencia|senior|titular|dependente/.test(query)) return null;
  const age = query.match(/\b(\d+)\s+anos\b/);
  if (!age || new Set(pages.map(page => page.documentId)).size !== 1) return null;
  const rules = pages.flatMap(page => {
    const text = compact(page.content);
    if (page.sourceKind !== "pdf" || !/composicao\s*\/\s*quem pode aderir/i.test(plain(text))) return [];
    return Array.from(plain(text).matchAll(/para inclusao de menores de\s+(\d+)\s+anos e obrigatoria a presenca de[^.]+\./g), match => ({ page, minimum: Number(match[1]), quote: text.slice(match.index, match.index! + match[0].length) }));
  }).filter(rule => Number(age[1]) < rule.minimum);
  if (rules.length !== 1) return null;
  const rule = rules[0]!;
  return answer([{ page: rule.page, text: `Para uma criança de ${Number(age[1])} anos, a inclusão tem esta condição expressa:\n\n“${rule.quote}”` }], "Essa condição exige o adulto com vínculo familiar direto. Ela não especifica, por si só, que a criança ou o adulto precisa ser titular ou dependente.");
}
