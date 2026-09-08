/** Recover numeric tables from text when the PDF has no detectable grid.
 * Only align complete rows; ambiguous rows remain available in the original text.
 */
export function numericTableSections(text: string): string[] {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const sections: string[] = [];
  const context: string[] = [];
  let columns: string[] = [];
  let heading = "";
  const code = /^(?:\d+(?:\/\d+)*|[A-Za-z]+\d+[A-Za-z\d/]*|[A-Z]{2,8})$/;
  const value = /^(?:[-–—]|#+|[-+]?\d[\d.,]*[%]?)$/;
  const letter = new RegExp("\\p{L}", "u");
  for (const line of lines) {
    const tokens = line.split(/\s+/);
    let start = tokens.length;
    while (start > 0 && code.test(tokens[start - 1]!)) start--;
    const labels = tokens.slice(start);
    if (start > 0 && labels.length >= 2 && labels.some(label => /\d/.test(label)) && new Set(labels).size === labels.length) {
      columns = labels;
      heading = tokens.slice(0, start).join(" ");
      continue;
    }
    const cells = tokens.slice(-columns.length);
    const rowLabel = tokens.slice(0, -columns.length).join(" ");
    if (columns.length && rowLabel && letter.test(rowLabel) && !value.test(tokens[tokens.length - columns.length - 1]!) && cells.length === columns.length && cells.every(cell => value.test(cell))) {
      const prefix = [...context, `Tabela: ${heading}`, `Linha: ${rowLabel}`].join("\n");
      // Bound records without ever separating a value from its column and row.
      let record = prefix;
      columns.forEach((column, index) => {
        const field = `\nColuna ${column}: ${cells[index]}`;
        if (record.length + field.length > 1200 && record !== prefix) {
          sections.push(record);
          record = prefix;
        }
        record += field;
      });
      sections.push(record);
    } else {
      // Do not carry a header across prose, malformed rows, or section boundaries.
      columns = [];
      if (line.length < 200 && !/\d[.,]\d/.test(line)) {
        context.push(line);
        if (context.length > 3) context.shift();
      }
    }
  }
  return sections;
}
