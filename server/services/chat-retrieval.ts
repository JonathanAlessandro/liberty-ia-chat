export type CatalogDocument = { id: number; name: string; group: string | null };
export const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const identity = (text: string) => normalize(text).replace(/\btrasmontano\b/g, "transmontano").replace(/\bmed tour\b/g, "medtour");
const productWords = (name: string) => identity(name).split(" ").filter(word => !["painel", "pdf", "pf", "pme"].includes(word) && !/^\d+$/.test(word));

/** Resolve identity from the catalog, never from another chat or guessed plan names. */
export function resolveDocumentScope(question: string, history: Array<{ role: string; content: string }>, catalog: CatalogDocument[]) {
  const groups = Array.from(new Set(catalog.map(document => document.group).filter((group): group is string => !!group)))
    .sort((a, b) => b.length - a.length);
  const match = (text: string) => {
    const words = ` ${identity(text)} `;
    const exact = groups.filter(group => words.includes(` ${identity(group)} `));
    if (exact.length) return exact.filter(group => !exact.some(other => other !== group && normalize(other).includes(normalize(group))));
    return groups.filter(group => identity(group).split(" ").some(word => word.length >= 4 && !["saude", "seguros", "rede", "credenciada"].includes(word) && words.includes(` ${word} `)));
  };
  // Resolve each user turn in order. Assistant answers may contain a mistaken
  // operator and must never become the authority for subsequent retrieval.
  const destinationText = (text: string) => {
    const normalized = identity(text);
    const destination = normalized.match(/\b(?:vou|ir|mudar|migrar)\s+(?:para|pra|pro|a)\s+(?:a |o )?(.+)/);
    if (destination && match(destination[1]!).length) return destination[1]!;
    // Names following these constructions describe the origin, not the target.
    return normalized.replace(/\b(?:meses?|anos?)\s+(?:de|na|no)\s+.+?(?=\s+(?:e |como |a |o )|$)/g, " ")
      .replace(/\b(?:venho|vem|vier|vindo)\s+(?:de|da|do)\s+.+?(?=\s+(?:e |para |pra |pro )|$)/g, " ");
  };
  const modalityOf = (text: string) => {
    const matches = Array.from(normalize(text).matchAll(/\b(pf|individual|familiar|pme|empresarial)\b/g));
    const last = matches.at(-1)?.[1];
    return last ? /pf|individual|familiar/.test(last) ? "pf" : "pme" : undefined;
  };
  let selected: string[] = [];
  let priorSubject = "";
  let inheritedModality: string | undefined;
  let subject = question;
  for (const turn of [...history.filter(turn => turn.role === "user"), { role: "user", content: question }]) {
    const explicit = match(destinationText(turn.content));
    const followup = /\b(desse|deste|ness[ae]|mesm[oa]|ele|ela|anterior|continua|ainda|tenho|tivesse)\b|^(?:e\s|isso\b|pra\b|para\b)/.test(normalize(turn.content));
    if (explicit.length) {
      const same = explicit.join("|") === selected.join("|");
      selected = explicit;
      inheritedModality = modalityOf(turn.content) ?? (same ? inheritedModality : undefined);
      priorSubject = turn.content;
    } else if (followup && selected.length) {
      inheritedModality = modalityOf(turn.content) ?? inheritedModality;
    } else {
      selected = [];
      inheritedModality = undefined;
      priorSubject = "";
    }
    subject = priorSubject && priorSubject !== turn.content ? `${priorSubject.slice(0, 800)}\nContinuação: ${turn.content}` : turn.content;
  }
  let documents = catalog.filter(document => selected.includes(document.group ?? ""));
  const modality = inheritedModality;
  if (modality) {
    const exact = documents.filter(document => (` ${normalize(document.name)} `).includes(` ${modality} `));
    documents = exact.length ? exact : documents.filter(document => !/\b(pf|pme)\b/.test(normalize(document.name)));
  }
  // A group may contain several products (e.g. Seguros Unimed / Unimed Guarulhos).
  // Prefer the filename identity most explicitly named, before any content search.
  const subjectWords = new Set(identity(subject).split(" "));
  const scored = documents.map(document => ({ document, score: productWords(document.name).filter(word => subjectWords.has(word)).length }));
  documents = scored.filter(item => item.score === Math.max(0, ...scored.filter(other => other.document.group === item.document.group).map(other => other.score))).map(item => item.document);
  return { question: subject, documentIds: documents.map(document => document.id), selectedGroups: selected, modality };
}

export function isConversationOnly(question: string) {
  return /codigo ficticio|teste de memoria|inicio dest[ae] (chat|conversa)|informei nest[ae] conversa|qual.*(codigo|nome).*(chat|conversa)|voce conseguiu.*busca/.test(normalize(question));
}
