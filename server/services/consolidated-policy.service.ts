import type { ChatAnswer } from "../models/liberty-ai.models";
import type { PolicyPage } from "./commercial-policy.service";

const plain = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Preserve the whole policy block when summarizing would detach a channel or plan qualifier. */
export function directConsolidatedPolicyAnswer(question: string, pages: PolicyPage[]): ChatAnswer | null {
  const query = plain(question);
  const changeLetter = /\bcarta\b/.test(query) && /mud|alter|corrig|remarc/.test(query);
  const letter = !changeLetter && /\bcarta\b/.test(query) && /baix|emit|emiss|solicit|hora|site|concierge|prazo/.test(query);
  const hotel = /hotel|hospedagem/.test(query) && /alta/.test(query) && /reembols|quanto|valor|limite/.test(query);
  const baggage = /bagagem|\bmala\b/.test(query);
  const intents = [
    { active: changeLetter, title: /alteracao.*data.*carta/ },
    { active: letter, title: /solicitar.*carta|carta.*(?:envio|prazo)/ },
    { active: hotel, title: /reembolso.*hospedagem.*alta/ },
    { active: /covid/.test(query), title: /cobertura.*covid/ },
    { active: /acompanhante/.test(query) && /intern|hospitaliz|passagem/.test(query), title: /^organizacao.*envio.*acompanhante/ },
    { active: /remedio|medicamento|farmaceutic/.test(query) && /reembols|quanto|valor|limite/.test(query), title: /reembolso.*farmaceutic/ },
    { active: /document/.test(query) && /perd|extravi/.test(query), title: /orientacao.*perda.*document/ },
    { active: baggage && /indeniz|receb|quanto.*(?:paga|valor)|perd/.test(query), title: /indenizacao.*perda.*bagagem/ },
    { active: baggage && /procur|localiz/.test(query), title: /^localizacao.*bagagem/ },
    { active: /rotina|eletiv/.test(query) && /consult|tratament|saude/.test(query), title: /acidentes.*escopo/ },
  ].filter(intent => intent.active);
  if (!intents.length || (intents.length > 1 && !(baggage && intents.length === 2))) return null;
  const selected = intents.map(intent => pages.filter(page => {
    if (page.sourceKind !== "knowledge") return false;
    const title = plain(page.content.match(/^Bloco \d+ \[[^\]]+\]: (.+)$/m)?.[1] ?? "");
    return intent.title.test(title);
  }));
  const unique = selected.map(matches => Array.from(new Map(matches.map(page => [`${page.documentId}:${page.pageStart}`, page])).values()));
  if (unique.some(matches => matches.length !== 1)) return null;
  const blocks = unique.map(matches => {
    const page = matches[0]!;
    return { page, plans: page.content.match(/^Assuntos: .*? Planos \/ versões: (.+)$/m)?.[1], body: page.content.match(/^Situação documental: [^\n]+\n([\s\S]+?)\nFontes originais: /m)?.[1], originals: page.content.match(/^Fontes originais: (.+)$/m)?.[1] };
  });
  if (new Set(blocks.map(block => block.page.documentId)).size !== 1 || blocks.some(block => !block.plans || !block.body || !block.originals)) return null;
  const clarification = /covid/.test(query) ? "Compare a data do diagnóstico com a data de início da viagem informada no seguro. Estar antes do embarque não prova, por si só, que o diagnóstico ocorreu em data anterior; não é possível concluir cobertura ou exclusão só com essa informação."
    : baggage || /farmaceutic|remedio|medicamento/.test(query) ? "Os valores documentados são limites sujeitos às condições e à análise do sinistro; não representam promessa de pagamento automático."
      : letter ? "Confirme o regime de pagamento e o canal aplicável; a menção a download imediato não deve ser estendida aos demais enquadramentos." : "";
  return {
    answer: `A base documenta estas condições:\n\n${blocks.map(({ page, plans, body, originals }) => `**Planos e versões:** ${plans}\n\n${body}\n\nFontes originais: ${originals}\n\n(${page.documentName}, bloco ${page.pageStart}.)`).join("\n\n")}${clarification ? `\n\n${clarification}` : ""}\n\nA data de organização não comprova vigência atual; confirme as condições da apólice.`,
    sources: blocks.map(({ page }) => ({ type: "document", documentId: page.documentId, documentName: page.documentName, pageStart: page.pageStart, pageEnd: page.pageEnd, locatorKind: "block" })),
    hasContext: true,
  };
}
