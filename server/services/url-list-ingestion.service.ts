import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { getDocumentBySourcePath, listDocumentsBySourcePathPrefix, prepareFolderDocument, removeDocument } from "../repositories/document.repository";
import { fingerprintBuffer } from "./document-storage.service";
import { indexExtractedTextDocument } from "./document-indexing.service";

const MAX_URLS_PER_FILE = 25;
const MAX_URL_LENGTH = 480;
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_PAGE_TEXT_CHARS = 45_000;
const FETCH_TIMEOUT_MS = 12_000;

export const URL_LIST_FILE_NAME = "fontes.txt";

export type RegisteredUrlSource = { url: string; effectiveAt: Date | null; sourceGroup: string | null };

export function isUrlListFile(filePath: string) {
  return filePath.replaceAll("\\", "/").toLowerCase().endsWith(`/${URL_LIST_FILE_NAME}`) || filePath.toLowerCase() === URL_LIST_FILE_NAME;
}

export function parseUrlList(content: string) {
  return parseRegisteredUrlSources(content).map(source => source.url);
}

function parseDeclaredDate(value: string) {
  const match = value.trim().match(/^(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
  if (!match) throw new Error("A vigência em fontes.txt deve usar o formato AAAA-MM-DD após o caractere |.");
  const [year, month, day] = match.slice(1).map(Number);
  const effectiveAt = new Date(Date.UTC(year!, month! - 1, day!));
  if (effectiveAt.getUTCFullYear() !== year || effectiveAt.getUTCMonth() !== month! - 1 || effectiveAt.getUTCDate() !== day) throw new Error("A vigência em fontes.txt contém uma data inválida.");
  return effectiveAt;
}

export function parseRegisteredUrlSources(content: string): RegisteredUrlSource[] {
  const unique = new Set<string>();
  const sources: RegisteredUrlSource[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const candidate = rawLine.trim();
    if (!candidate || candidate.startsWith("#")) continue;
    const [rawUrl, rawEffectiveAt, rawSourceGroup, ...unexpected] = candidate.split("|");
    if (!rawUrl || rawUrl.trim().length > MAX_URL_LENGTH) throw new Error("Uma URL em fontes.txt excede o tamanho permitido.");
    if (unexpected.length) throw new Error("Cada linha de fontes.txt aceita URL, vigência opcional e operadora opcional, separados por |.");
    const url = assertPublicHttpUrl(rawUrl.trim());
    const normalizedUrl = url.toString();
    const effectiveAt = rawEffectiveAt?.trim() ? parseDeclaredDate(rawEffectiveAt) : null;
    const sourceGroup = rawSourceGroup?.trim().toLocaleLowerCase("pt-BR") || null;
    if (sourceGroup && !/^[a-z0-9][a-z0-9-]{0,126}$/.test(sourceGroup)) throw new Error("A operadora em fontes.txt deve usar letras minúsculas, números ou hífen.");
    if (!unique.has(normalizedUrl)) sources.push({ url: normalizedUrl, effectiveAt, sourceGroup });
    unique.add(normalizedUrl);
    if (unique.size > MAX_URLS_PER_FILE) throw new Error(`fontes.txt aceita no máximo ${MAX_URLS_PER_FILE} URLs.`);
  }
  return sources;
}

function isBlockedIp(address: string) {
  const normalized = address.toLowerCase();
  if (normalized === "::1" || normalized === "::" || normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("::ffff:")) return true;
  if (isIP(address) !== 4) return false;
  const [first, second] = address.split(".").map(Number);
  return first === 0 || first === 10 || first === 127 || first >= 224 || first === 169 && second === 254 || first === 172 && second >= 16 && second <= 31 || first === 192 && second === 168 || first === 100 && second >= 64 && second <= 127 || first === 198 && (second === 18 || second === 19);
}

export function assertPublicHttpUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`URL inválida em fontes.txt: ${value.slice(0, 160)}`);
  }
  const host = url.hostname.toLowerCase();
  const allowedPort = !url.port || url.port === "80" || url.port === "443";
  if ((url.protocol !== "http:" && url.protocol !== "https:") || !host || url.username || url.password || !allowedPort || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || isBlockedIp(host)) {
    throw new Error(`URL não permitida em fontes.txt: ${url.toString()}`);
  }
  return url;
}

async function assertHostResolvesToPublicNetwork(url: URL) {
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(record => isBlockedIp(record.address))) throw new Error(`O destino da URL não é uma rede pública permitida: ${url.hostname}`);
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtml(value: string) {
  return decodeHtml(
    value
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|canvas|iframe)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(p|div|section|article|main|header|footer|li|h[1-6]|br)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .replace(/ ?\n ?/g, "\n")
      .trim(),
  );
}

function titleFromHtml(html: string, fallback: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = match ? stripHtml(match[1] ?? "") : "";
  return (title || fallback).replace(/\s+/g, " ").trim().slice(0, 220);
}

async function readPageBody(response: Response) {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_PAGE_BYTES) throw new Error("A página excede o limite de 2 MB para importação.");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    size += result.value.byteLength;
    if (size > MAX_PAGE_BYTES) {
      await reader.cancel();
      throw new Error("A página excede o limite de 2 MB para importação.");
    }
    chunks.push(result.value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

async function fetchPublicPage(urlString: string) {
  const url = assertPublicHttpUrl(urlString);
  await assertHostResolvesToPublicNetwork(url);
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "User-Agent": "LibertyAI-Knowledge-Importer/1.0", Accept: "text/html,text/plain;q=0.9" },
  });
  if (!response.ok) throw new Error(`A página retornou HTTP ${response.status}.`);
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("text/html") && !contentType.includes("text/plain")) throw new Error("A URL não retornou uma página HTML ou texto simples.");
  const body = await readPageBody(response);
  const text = (contentType.includes("text/html") ? stripHtml(body) : body.replace(/\s+/g, " ").trim()).slice(0, MAX_PAGE_TEXT_CHARS);
  if (text.length < 80) throw new Error("A página não contém texto suficiente para indexação.");
  return { url: url.toString(), title: contentType.includes("text/html") ? titleFromHtml(body, url.hostname) : url.hostname, text };
}

function sourcePathForUrl(url: string) {
  return `url-list/${fingerprintBuffer(Buffer.from(url)).slice(0, 40)}.url`;
}

export async function removeUrlListSources() {
  const existing = await listDocumentsBySourcePathPrefix("url-list/");
  await Promise.all(existing.map(document => removeDocument(document.id)));
}

export async function ingestUrlList(content: string) {
  const sources = parseRegisteredUrlSources(content);
  const sourcePaths = new Set(sources.map(source => sourcePathForUrl(source.url)));
  const existingSources = await listDocumentsBySourcePathPrefix("url-list/");
  await Promise.all(existingSources.filter(document => !sourcePaths.has(document.sourcePath ?? "")).map(document => removeDocument(document.id)));

  const results: Array<{ url: string; status: "indexed" | "unchanged" | "failed"; error?: string }> = [];
  for (const source of sources) {
    const url = source.url;
    const sourcePath = sourcePathForUrl(url);
    const existing = await getDocumentBySourcePath(sourcePath);
    try {
      const page = await fetchPublicPage(url);
      const fingerprint = fingerprintBuffer(Buffer.from(`${page.url}\n${page.title}\n${page.text}`));
      const existingEffectiveTime = existing?.effectiveAt?.getTime() ?? null;
      const declaredEffectiveTime = source.effectiveAt?.getTime() ?? null;
      if (existing?.sourceFingerprint === fingerprint && existing.status === "ready" && existingEffectiveTime === declaredEffectiveTime) {
        results.push({ url, status: "unchanged" });
        continue;
      }
      const document = await prepareFolderDocument({
        existingDocumentId: existing?.id,
        originalName: `${page.title} · ${new URL(page.url).hostname}`.slice(0, 255),
        storageKey: page.url,
        mimeType: "text/html",
        sourceKind: "web",
        sourceAuthority: "official_registered",
        sourceGroup: source.sourceGroup,
        effectiveAt: source.effectiveAt,
        sourcePath,
        sourceFingerprint: fingerprint,
        sizeBytes: Buffer.byteLength(page.text),
      });
      await indexExtractedTextDocument(document.id, [{ ordinal: 0, label: 1, text: `Página cadastrada: ${page.url}\n\n${page.text}` }]);
      results.push({ url, status: "indexed" });
    } catch (error) {
      if (existing) await removeDocument(existing.id);
      results.push({ url, status: "failed", error: error instanceof Error ? error.message : "Falha desconhecida." });
    }
  }
  return results;
}
