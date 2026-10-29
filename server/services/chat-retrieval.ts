export type CatalogDocument = { id: number; name: string; group: string | null };
export const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Resolve identity from the catalog, never from another chat or guessed plan names. */
export function resolveDocumentScope(question: string, history: Array<{ role: string; content: string }>, catalog: CatalogDocument[]) {
  const groups = Array.from(new Set(catalog.map(document => document.group).filter((group): group is string => !!group)))
    .sort((a, b) => b.length - a.length);
  const match = (text: string) => {
    const words = ` ${normalize(text)} `;
    const exact = groups.filter(group => words.includes(` ${normalize(group)} `));
    if (exact.length) return exact.filter(group => !exact.some(other => other !== group && normalize(other).includes(normalize(group))));
    return groups.filter(group => normalize(group).split(" ").some(word => word.length >= 4 && !["saude", "seguros", "rede", "credenciada"].includes(word) && words.includes(` ${word} `)));
  };
  let subject = question;
  let selected = match(subject);
  const followup = /\b(desse|deste|ness[ae]|mesm[oa]|ele|ela|anterior|continua|ainda)\b|^e\s/.test(normalize(question));
  if (!selected.length && followup) {
    const previous = [...history].reverse().find(turn => turn.role === "user" && match(turn.content).length);
    if (previous) { subject = `${previous.content.slice(0, 800)} ${question}`; selected = match(previous.content); }
  }
  let documents = catalog.filter(document => selected.includes(document.group ?? ""));
  const modality = /\b(pf|individual|familiar)\b/.test(normalize(subject)) ? "pf" : /\b(pme|empresarial)\b/.test(normalize(subject)) ? "pme" : undefined;
  if (modality) {
    const exact = documents.filter(document => (` ${normalize(document.name)} `).includes(` ${modality} `));
    if (exact.length) documents = exact;
  }
  return { question: subject, documentIds: documents.map(document => document.id), selectedGroups: selected };
}

export function isConversationOnly(question: string) {
  return /codigo ficticio|teste de memoria|inicio dest[ae] (chat|conversa)|informei nest[ae] conversa|qual.*(codigo|nome).*(chat|conversa)|voce conseguiu.*busca/.test(normalize(question));
}
