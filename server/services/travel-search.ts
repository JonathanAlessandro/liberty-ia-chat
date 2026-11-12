const plain = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Vocabulary only: never adds a coverage, value, product or contractual rule. */
export function expandTravelSearch(text: string) {
  const query = plain(text);
  if (!/\b(?:viag\w*|viaj\w*|schengen|exterior|embarq\w*|embarcar)\b/.test(query)) return text;
  const aliases = ["viagem"];
  if (/\b(?:remedios?|medicamentos?)\b/.test(query)) aliases.push("despesas farmacêuticas", "reembolso");
  if (/document/.test(query) && /perd|extravi/.test(query)) aliases.push("orientação", "perda de documentos", "acionamento");
  if (/\bmala\b/.test(query)) aliases.push("bagagem");
  if (/procur/.test(query) && /bagagem|\bmala\b/.test(query)) aliases.push("localização");
  if (/\bcarta\b/.test(query) && /mud|alter|corrig|remarc/.test(query)) aliases.push("alteração", "data", "carta");
  if (/acompanhante/.test(query) && /intern/.test(query)) aliases.push("hospitalizado", "envio de acompanhante");
  return `${text}\n${aliases.join(" ")}`;
}
