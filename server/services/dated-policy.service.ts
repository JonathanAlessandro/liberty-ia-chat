import type { ChatAnswer, SourceReference } from "../models/liberty-ai.models";
import type { PolicyPage } from "./commercial-policy.service";

const plain = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
function day(year: number, month: number, date: number) {
  const value = new Date(Date.UTC(year, month - 1, date));
  return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === date ? value.getTime() : null;
}
function dateRange(question: string): { start: number; end: number } | null {
  const text = plain(question);
  const relativeDate = (index: number) => /\b(?:antes|depois|ate|a partir)(?:\s+(?:de|o|a|dia|mes))*\s*$/.test(text.slice(0, index));
  const dates = Array.from(text.matchAll(/\b(?:(\d{4})-(\d{2})-(\d{2})|(\d{1,2})\/(\d{1,2})\/(\d{4}))\b/g));
  if (dates.length === 1) {
    const match = dates[0]!;
    if (relativeDate(match.index!)) return null;
    const value = match[1] ? day(Number(match[1]), Number(match[2]), Number(match[3])) : day(Number(match[6]), Number(match[5]), Number(match[4]));
    return value === null ? null : { start: value, end: value };
  }
  if (dates.length > 1) return null;
  const months = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const matches = Array.from(text.matchAll(/\b(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+(?:de\s+)?(\d{4})\b/g));
  if (matches.length !== 1) return null;
  const match = matches[0]!;
  if (relativeDate(match.index!)) return null;
  const month = months.indexOf(match[1]!) + 1;
  const year = Number(match[2]);
  const start = day(year, month, 1);
  if (start === null) return null;
  return { start, end: new Date(Date.UTC(year, month, 0)).getTime() };
}

/** Compare dates to source-declared versions, never to a model's inferred cutoff. */
export function directDatedTravelAnswer(question: string, resolvedQuestion: string, pages: PolicyPage[]): ChatAnswer | null {
  const query = plain(resolvedQuestion);
  if (!/\bnacional\b/.test(query) || /nacional\s+plus|preferencial|premium/.test(query)
    || !/viag|schengen|franca|europa|exterior/.test(query) || !/medic|hospital|cobert|schengen/.test(query)
    || /hotel|hospedagem|carta|odontolog|fianca|juridic|bagagem|reembols/.test(plain(question))) return null;
  const candidates = pages.flatMap(page => {
    if (page.sourceKind !== "knowledge") return [];
    const plans = page.content.match(/^Assuntos: .*? Planos \/ versões: (.+)$/m)?.[1];
    const body = page.content.match(/^Situação documental: [^\n]+\n([\s\S]+?)\nFontes originais: /m)?.[1];
    const originals = page.content.match(/^Fontes originais: (.+)$/m)?.[1];
    if (!plans || !body || !originals || !/\bnacional\b/.test(plain(plans)) || /nacional plus|premium/.test(plain(plans)) || !/schengen/.test(plain(body)) || !/medic/.test(plain(body))) return [];
    const boundaries = Array.from(plain(plans).matchAll(/\b(ate|a partir de)\s+(\d{2})\/(\d{2})\/(\d{4})\b/g));
    if (boundaries.length !== 1) return [];
    const boundary = boundaries[0]!;
    const value = day(Number(boundary[4]), Number(boundary[3]), Number(boundary[2]));
    return value === null ? [] : [{ page, plans, body, originals, direction: boundary[1]!, boundary: value }];
  });
  const versions = Array.from(new Map(candidates.map(rule => [`${rule.page.documentId}:${rule.page.pageStart}`, rule])).values());
  const old = versions.filter(rule => rule.direction === "ate");
  const recent = versions.filter(rule => rule.direction === "a partir de");
  if (old.length !== 1 || recent.length !== 1 || old[0]!.page.documentId !== recent[0]!.page.documentId || old[0]!.boundary >= recent[0]!.boundary) return null;
  // Only the current user turn determines the new date. A previous mistaken
  // assistant answer or a superseded user date must not select the version.
  const date = dateRange(question);
  const selected = date ? versions.filter(rule => rule.direction === "ate" ? date.end <= rule.boundary : date.start >= rule.boundary) : [];
  const rules = selected.length === 1 ? selected : [old[0]!, recent[0]!];
  const sources: SourceReference[] = rules.map(rule => ({ type: "document", documentId: rule.page.documentId, documentName: rule.page.documentName, pageStart: rule.page.pageStart, pageEnd: rule.page.pageEnd, locatorKind: "block" }));
  return {
    answer: `${selected.length === 1 ? "A data informada se situa no seguinte período documentado" : "É necessário distinguir estes dois períodos documentados"}:\n\n${rules.map(rule => `**${rule.plans}**\n\n${rule.body}\n\nFontes originais: ${rule.originals}\n\n(${rule.page.documentName}, bloco ${rule.page.pageStart}.)`).join("\n\n")}\n\nConfirme a data de vigência/implantação da apólice: o folheto usa contratação e o manual usa vigência para a versão nova. Não trate data de contratação como prova automática de vigência nem use a data de coleta da base para escolher uma versão. As condições da apólice precisam ser confirmadas.`,
    sources, hasContext: true,
  };
}
