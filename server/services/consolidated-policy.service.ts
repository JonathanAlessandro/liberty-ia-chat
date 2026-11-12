import type { ChatAnswer } from "../models/liberty-ai.models";
import type { PolicyPage } from "./commercial-policy.service";

const plain = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Preserve the whole policy block when summarizing would detach a channel or plan qualifier. */
export function directConsolidatedPolicyAnswer(question: string, pages: PolicyPage[]): ChatAnswer | null {
  const query = plain(question);
  const letter = /\bcarta\b/.test(query) && /baix|emit|emiss|solicit|hora|site|concierge|prazo/.test(query);
  const hotel = /hotel|hospedagem/.test(query) && /alta/.test(query) && /reembols|quanto|valor|limite/.test(query);
  if (letter === hotel) return null;
  const matches = pages.filter(page => {
    if (page.sourceKind !== "knowledge") return false;
    const title = plain(page.content.match(/^Bloco \d+ \[[^\]]+\]: (.+)$/m)?.[1] ?? "");
    return letter ? /solicitar.*carta|carta.*(?:envio|prazo)/.test(title) : /reembolso.*hospedagem.*alta/.test(title);
  });
  const unique = Array.from(new Map(matches.map(page => [`${page.documentId}:${page.pageStart}`, page])).values());
  if (unique.length !== 1) return null;
  const page = unique[0]!;
  const plans = page.content.match(/^Assuntos: .*? Planos \/ versões: (.+)$/m)?.[1];
  const body = page.content.match(/^Situação documental: [^\n]+\n([\s\S]+?)\nFontes originais: /m)?.[1];
  const originals = page.content.match(/^Fontes originais: (.+)$/m)?.[1];
  if (!plans || !body || !originals) return null;
  return {
    answer: `A base documenta estas condições:\n\n**Planos e versões:** ${plans}\n\n${body}\n\n${letter ? "Confirme o regime de pagamento e o canal aplicável; a menção a download imediato não deve ser estendida aos demais enquadramentos.\n\n" : ""}Fontes originais: ${originals}\n\n(${page.documentName}, bloco ${page.pageStart}.)\n\nA data de organização não comprova vigência atual; confirme as condições da apólice.`,
    sources: [{ type: "document", documentId: page.documentId, documentName: page.documentName, pageStart: page.pageStart, pageEnd: page.pageEnd, locatorKind: "block" }],
    hasContext: true,
  };
}
