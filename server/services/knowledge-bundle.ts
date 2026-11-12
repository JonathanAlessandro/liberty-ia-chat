import { z } from "zod";
import type { IndexedChunk } from "../models/liberty-ai.models";

export const KNOWLEDGE_BUNDLE_VERSION = "knowledge-bundle-v1";
export const isKnowledgeBundle = (name: string) => name.toLowerCase().endsWith(".knowledge.json");
const sourceSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/).max(80),
  name: z.string().trim().min(1).max(255),
  pageCount: z.number().int().positive().max(5000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  collectedAt: z.string().date().nullable(),
}).strict();
const blockSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/).max(100),
  title: z.string().trim().min(3).max(200),
  topics: z.array(z.string().trim().min(2).max(80)).min(1).max(16),
  plans: z.array(z.string().trim().min(1).max(100)).min(1).max(12),
  status: z.enum(["concordante", "complementar", "divergente", "nao_confirmado"]),
  content: z.string().trim().min(20).max(6000),
  references: z.array(z.object({ sourceId: z.string(), pages: z.array(z.number().int().positive()).min(1).max(20) }).strict()).min(1).max(6),
}).strict();
const bundleSchema = z.object({
  schemaVersion: z.literal(1),
  title: z.string().trim().min(3).max(200),
  sourceGroup: z.string().trim().min(2).max(80),
  assembledAt: z.string().date(),
  effectiveAt: z.null(),
  scope: z.string().trim().min(20).max(1200),
  sources: z.array(sourceSchema).min(1).max(50),
  blocks: z.array(blockSchema).min(1).max(1000),
}).strict();
export type KnowledgeBundle = z.infer<typeof bundleSchema>;

export function parseKnowledgeBundle(buffer: Buffer): KnowledgeBundle {
  const bundle = bundleSchema.parse(JSON.parse(buffer.toString("utf8").replace(/^\uFEFF/, "")));
  const sources = new Map(bundle.sources.map(source => [source.id, source]));
  if (sources.size !== bundle.sources.length || new Set(bundle.blocks.map(block => block.id)).size !== bundle.blocks.length) throw new Error("IDs duplicados na base consolidada.");
  for (const block of bundle.blocks) for (const ref of block.references) {
    const source = sources.get(ref.sourceId);
    if (!source || ref.pages.some(page => page > source.pageCount)) throw new Error(`Fonte ou página inválida no bloco ${block.id}.`);
  }
  return bundle;
}

/** One complete block per chunk: never split a condition from its scope or sources. */
export function knowledgeBundleChunks(bundle: KnowledgeBundle): IndexedChunk[] {
  return bundle.blocks.map((block, index) => {
    const sources = block.references.map(ref => {
      const source = bundle.sources.find(source => source.id === ref.sourceId)!;
      return `${source.name}, páginas ${ref.pages.join(", ")}`;
    });
    const content = [
      `Base consolidada: ${bundle.title}. Operadora: ${bundle.sourceGroup}.`,
      `Bloco ${index + 1} [${block.id}]: ${block.title}`,
      `Assuntos: ${block.topics.join(", ")}. Planos / versões: ${block.plans.join("; ")}.`,
      `Situação documental: ${block.status}.`,
      block.content,
      `Fontes originais: ${sources.join("; ")}.`,
      `Organizado em ${bundle.assembledAt}; esta data não é vigência contratual. Vigência atual não confirmada.`,
    ].join("\n");
    if (content.length > 8000) throw new Error(`Bloco ${block.id} excede 8.000 caracteres com seus metadados; divida-o por assunto preservando as fontes.`);
    return { content, ordinal: index, pageStart: index + 1, pageEnd: index + 1 };
  });
}
