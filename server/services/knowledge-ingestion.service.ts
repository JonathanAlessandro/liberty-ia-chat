import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";
import { indexExtractedTextDocument, indexPdfDocument } from "./document-indexing.service";
import { fingerprintBuffer, storeKnowledgeAsset } from "./document-storage.service";
import { getDocumentBySourcePath, prepareFolderDocument, removeDocument } from "../repositories/document.repository";
import { ingestUrlList, isUrlListFile, removeUrlListSources } from "./url-list-ingestion.service";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_SPREADSHEET_BYTES = 8 * 1024 * 1024;
const MAX_SPREADSHEET_ROWS = 100_000;
const KNOWN_EXTENSIONS = new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp", ".xlsx", ".xls", ".csv"]);

type KnowledgeKind = "pdf" | "image" | "spreadsheet";

export function effectiveDateFromPath(value: string) {
  const match = value.match(/(?:^|[^\d])(20\d{2})[-_.](0[1-9]|1[0-2])[-_.](0[1-9]|[12]\d|3[01])(?:[^\d]|$)/);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const effectiveAt = new Date(Date.UTC(year!, month! - 1, day!));
  return effectiveAt.getUTCFullYear() === year && effectiveAt.getUTCMonth() === month! - 1 && effectiveAt.getUTCDate() === day ? effectiveAt : null;
}

export function sourceGroupFromPath(relativePath: string) {
  const [firstDirectory] = relativePath.replaceAll("\\", "/").split("/");
  return firstDirectory && !firstDirectory.includes(".") ? firstDirectory.trim().toLocaleLowerCase("pt-BR") || null : null;
}

function describeFile(filePath: string): { kind: KnowledgeKind; mimeType: string } | null {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".pdf") return { kind: "pdf", mimeType: "application/pdf" };
  if ([".png", ".jpg", ".jpeg", ".webp"].includes(extension)) return { kind: "image", mimeType: extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg" };
  if ([".xlsx", ".xls", ".csv"].includes(extension)) return { kind: "spreadsheet", mimeType: extension === ".csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
  return null;
}

async function ocrImage(filePath: string) {
  return new Promise<string>((resolve, reject) => {
    const process = spawn("tesseract", [filePath, "stdout", "-l", "por+eng"], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let error = "";
    process.stdout.on("data", chunk => { output += chunk.toString(); });
    process.stderr.on("data", chunk => { error += chunk.toString(); });
    process.on("error", () => reject(new Error("OCR indisponível. Verifique se o Tesseract foi instalado no contêiner.")));
    process.on("close", code => code === 0 ? resolve(output) : reject(new Error(`OCR falhou: ${error.slice(0, 300)}`)));
  });
}

export function spreadsheetSections(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", dense: true, cellDates: false });
  const sections: Array<{ ordinal: number; label: number; text: string }> = [];
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Array<string | number | boolean>>(workbook.Sheets[sheetName]!, { header: 1, defval: "", blankrows: false, raw: false });
    if (rows.length > MAX_SPREADSHEET_ROWS) throw new Error(`A aba ${sheetName} excede ${MAX_SPREADSHEET_ROWS.toLocaleString("pt-BR")} linhas. Compacte ou divida a planilha antes da indexação.`);
    const headers = (rows[0] ?? []).map((value, index) => String(value).trim() || `coluna_${index + 1}`);
    rows.slice(1).forEach((row, rowIndex) => {
      const fields = row
        .map((value, columnIndex) => ({ label: headers[columnIndex] ?? `coluna_${columnIndex + 1}`, value: String(value).trim() }))
        .filter(field => field.value)
        .map(field => `${field.label}: ${field.value}`);
      if (fields.length) sections.push({ ordinal: sections.length, label: rowIndex + 2, text: `Planilha: ${sheetName}\nLinha ${rowIndex + 2}\n${fields.join(" | ")}` });
    });
  }
  return sections;
}

export function isSupportedKnowledgeFile(filePath: string) {
  return isUrlListFile(filePath) || KNOWN_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export async function ingestKnowledgeFile(rootDir: string, absolutePath: string) {
  if (isUrlListFile(absolutePath)) return { action: "url-list" as const, results: await ingestUrlList(await readFile(absolutePath, "utf8")) };
  const descriptor = describeFile(absolutePath);
  if (!descriptor) return { action: "ignored" as const };
  const details = await stat(absolutePath);
  if (!details.isFile() || details.size > MAX_FILE_BYTES) throw new Error("Arquivo inválido ou maior que 25 MB para a sincronização automática.");
  if (descriptor.kind === "spreadsheet" && details.size > MAX_SPREADSHEET_BYTES) throw new Error("Planilha maior que 8 MB. Compacte ou divida o arquivo antes da indexação para proteger a memória da aplicação.");
  const relativePath = path.relative(rootDir, absolutePath).replaceAll(path.sep, "/");
  if (relativePath.startsWith("..") || !relativePath) throw new Error("Arquivo fora da pasta de conhecimento.");
  const buffer = await readFile(absolutePath);
  const fingerprint = fingerprintBuffer(buffer);
  const existing = await getDocumentBySourcePath(relativePath);
  if (existing?.sourceFingerprint === fingerprint && existing.status === "ready") return { action: "unchanged" as const, document: existing };

  const stored = await storeKnowledgeAsset({ fileName: path.basename(absolutePath), buffer, mimeType: descriptor.mimeType });
  const document = await prepareFolderDocument({
    existingDocumentId: existing?.id,
    originalName: path.basename(absolutePath),
    storageKey: stored.key,
    mimeType: descriptor.mimeType,
    sourceKind: descriptor.kind,
    sourceAuthority: "internal_training",
    sourceGroup: sourceGroupFromPath(relativePath),
    effectiveAt: effectiveDateFromPath(relativePath),
    sourcePath: relativePath,
    sourceFingerprint: fingerprint,
    sizeBytes: buffer.length,
  });

  if (descriptor.kind === "pdf") await indexPdfDocument(document.id, buffer);
  if (descriptor.kind === "spreadsheet") await indexExtractedTextDocument(document.id, spreadsheetSections(buffer));
  if (descriptor.kind === "image") await indexExtractedTextDocument(document.id, [{ ordinal: 0, label: 1, text: await ocrImage(absolutePath) }]);
  return { action: existing ? "updated" as const : "added" as const, document };
}

export async function removeKnowledgeFile(rootDir: string, absolutePath: string) {
  if (isUrlListFile(absolutePath)) {
    await removeUrlListSources();
    return;
  }
  const relativePath = path.relative(rootDir, absolutePath).replaceAll(path.sep, "/");
  const existing = await getDocumentBySourcePath(relativePath);
  if (existing?.sourceOrigin === "folder") await removeDocument(existing.id);
}
