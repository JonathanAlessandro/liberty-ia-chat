export type LightweightInline =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "code"; value: string }
  | { type: "link"; label: string; href: string };

export type LightweightBlock =
  | { type: "paragraph"; lines: LightweightInline[][] }
  | { type: "unordered-list"; items: LightweightInline[][] }
  | { type: "ordered-list"; items: LightweightInline[][] }
  | { type: "table"; headers: LightweightInline[][]; rows: LightweightInline[][][] };

const inlinePattern = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;

function splitTableRow(line: string) {
  return line.trim().replace(/^\||\|$/g, "").split("|").map(cell => cell.trim());
}

function isTableSeparator(line: string) {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell));
}

export function parseLightweightInline(value: string): LightweightInline[] {
  const parts: LightweightInline[] = [];
  let cursor = 0;
  inlinePattern.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlinePattern.exec(value)) !== null) {
    if (match.index > cursor) parts.push({ type: "text", value: value.slice(cursor, match.index) });
    if (match[2]) parts.push({ type: "bold", value: match[2] });
    else if (match[3]) parts.push({ type: "code", value: match[3] });
    else if (match[4] && match[5]) parts.push({ type: "link", label: match[4], href: match[5] });
    cursor = match.index + match[0].length;
  }

  if (cursor < value.length) parts.push({ type: "text", value: value.slice(cursor) });
  return parts.length ? parts : [{ type: "text", value }];
}

export function parseLightweightMarkdown(value: string): LightweightBlock[] {
  return value
    .trim()
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((section) => {
      const lines = section.split("\n").filter(Boolean);
      const unordered = lines.every((line) => /^[-*]\s+/.test(line));
      if (unordered) return { type: "unordered-list" as const, items: lines.map((line) => parseLightweightInline(line.replace(/^[-*]\s+/, ""))) };

      const ordered = lines.every((line) => /^\d+\.\s+/.test(line));
      if (ordered) return { type: "ordered-list" as const, items: lines.map((line) => parseLightweightInline(line.replace(/^\d+\.\s+/, ""))) };

      const isTable = lines.length >= 2 && lines[0].includes("|") && isTableSeparator(lines[1]) && lines.slice(2).every(line => line.includes("|"));
      if (isTable) {
        const headers = splitTableRow(lines[0]).map(parseLightweightInline);
        const rows = lines.slice(2).map(line => splitTableRow(line).slice(0, headers.length).map(parseLightweightInline));
        return { type: "table" as const, headers, rows };
      }

      return { type: "paragraph" as const, lines: lines.map(parseLightweightInline) };
    });
}
