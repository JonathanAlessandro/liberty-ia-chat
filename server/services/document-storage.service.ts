import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável de ambiente ${name} não está configurada.`);
  return value;
}

function getStorageConfig() {
  return {
    endpoint: requiredEnvironment("S3_ENDPOINT"),
    region: process.env.S3_REGION?.trim() || "us-east-1",
    bucket: requiredEnvironment("S3_BUCKET"),
    accessKeyId: requiredEnvironment("S3_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnvironment("S3_SECRET_ACCESS_KEY"),
  };
}

function getS3Client() {
  const config = getStorageConfig();
  return {
    config,
    client: new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    }),
  };
}

export async function storeDocumentPdf(fileName: string, buffer: Buffer) {
  const { config, client } = getS3Client();
  const key = `documents/${randomUUID()}-${fileName}`;

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: buffer,
      ContentType: "application/pdf",
      ContentLength: buffer.length,
    }),
  );

  return { key };
}

export async function removeDocumentPdf(key: string) {
  const { config, client } = getS3Client();
  await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
}
