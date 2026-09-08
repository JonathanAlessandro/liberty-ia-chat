import { PDFParse } from "pdf-parse";
import { numericTableSections } from "./pdf-table-text";
import type { IndexedChunk } from "../models/liberty-ai.models";
import { completeDocumentIndexing, failDocumentIndexing } from "../repositories/document.repository";

const CHUNK_SIZE = 1400;
const CHUNK_OVERLAP = 140;
export const PDF_INDEX_VERSION = "pdf-tables-v2";

function normalizeText(text: string) {
  return text.replace(/\u0000/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function splitText(text: string) {
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    let end = Math.min(cursor + CHUNK_SIZE, text.length);
    if (end < text.length) {
      const sentenceBreak = Math.max(text.lastIndexOf(". ", end), text.lastIndexOf("\n", end));
      if (sentenceBreak > cursor + Math.floor(CHUNK_SIZE * 0.55)) end = sentenceBreak + 1;
    }
    const chunk = text.slice(cursor, end).trim();
    if (chunk.length > 0) chunks.push(chunk);
    if (end >= text.length) break;
    cursor = Math.max(end - CHUNK_OVERLAP, cursor + 1);
  }
  return chunks;
}

export async function indexExtractedTextDocument(documentId: number, sections: Array<{ ordinal: number; label: number; text: string }>) {
  try {
    const chunks: IndexedChunk[] = [];
    sections.forEach(section => splitText(normalizeText(section.text)).forEach(content => chunks.push({ content, pageStart: section.label, pageEnd: section.label, ordinal: chunks.length })));
    if (chunks.length === 0) throw new Error("Não foi possível extrair conteúdo textual suficiente deste arquivo.");
    await completeDocumentIndexing(documentId, sections.reduce((count, section) => Math.max(count, section.label), 1), chunks);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido durante a indexação.";
    await failDocumentIndexing(documentId, message);
    throw error;
  }
}

export async function indexPdfDocument(documentId: number, buffer: Buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const sections = result.pages.flatMap(page => [page.text, ...numericTableSections(page.text)]
      .map(text => ({ ordinal: 0, label: page.num, text })));
    await indexExtractedTextDocument(documentId, sections);
  } finally {
    await parser.destroy();
  }
}
