import { PDFParse } from "pdf-parse";
import type { IndexedChunk } from "../models/liberty-ai.models";
import { completeDocumentIndexing, failDocumentIndexing } from "../repositories/document.repository";

const CHUNK_SIZE = 1150;
const CHUNK_OVERLAP = 180;

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
    if (chunk.length >= 80) chunks.push(chunk);
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
    await completeDocumentIndexing(documentId, Math.max(1, sections.length), chunks);
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
    await indexExtractedTextDocument(documentId, result.pages.map(page => ({ ordinal: page.num - 1, label: page.num, text: page.text })));
  } finally {
    await parser.destroy();
  }
}
