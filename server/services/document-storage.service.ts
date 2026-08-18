import { CreateBucketCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createHash, randomUUID } from "node:crypto";
import { storagePut } from "../storage";

type StoredDocument = { key: string; url: string | null };

function createS3Client() {
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return { bucket, client: new S3Client({ endpoint, region: process.env.S3_REGION ?? "us-east-1", forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } }) };
}

async function ensureS3Bucket(s3: NonNullable<ReturnType<typeof createS3Client>>) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      await s3.client.send(new HeadBucketCommand({ Bucket: s3.bucket }));
      return;
    } catch {
      try {
        await s3.client.send(new CreateBucketCommand({ Bucket: s3.bucket }));
        return;
      } catch (error) {
        lastError = error;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("O armazenamento S3 não ficou disponível a tempo.");
}

export function fingerprintBuffer(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function storeKnowledgeAsset(input: { fileName: string; buffer: Buffer; mimeType: string; folder?: string }): Promise<StoredDocument> {
  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
  const key = `liberty-ai/${input.folder ?? "knowledge"}/${fingerprintBuffer(input.buffer).slice(0, 16)}-${randomUUID()}-${safeName}`;
  const s3 = createS3Client();
  if (s3) {
    await ensureS3Bucket(s3);
    await s3.client.send(new PutObjectCommand({ Bucket: s3.bucket, Key: key, Body: input.buffer, ContentType: input.mimeType }));
    return { key, url: null };
  }
  const uploaded = await storagePut(key, input.buffer, input.mimeType);
  return { key: uploaded.key, url: uploaded.url };
}

export async function storeDocumentPdf(fileName: string, buffer: Buffer) {
  return storeKnowledgeAsset({ fileName, buffer, mimeType: "application/pdf", folder: "pdfs" });
}
