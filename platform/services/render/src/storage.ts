import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export const BUCKETS = {
  sources: process.env.S3_BUCKET_SOURCES ?? "sources",
  artifacts: process.env.S3_BUCKET_ARTIFACTS ?? "artifacts",
  renders: process.env.S3_BUCKET_RENDERS ?? "renders",
};

export const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
  region: process.env.S3_REGION ?? "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? "onepct",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "onepct-secret",
  },
});

/** Keys are "bucket/key/path" strings throughout the platform. */
export function splitKey(fullKey: string): { bucket: string; key: string } {
  const idx = fullKey.indexOf("/");
  return { bucket: fullKey.slice(0, idx), key: fullKey.slice(idx + 1) };
}

export async function downloadToFile(fullKey: string, destPath: string): Promise<void> {
  const { bucket, key } = splitKey(fullKey);
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  await pipeline(res.Body as Readable, createWriteStream(destPath));
}

export async function uploadFile(fullKey: string, srcPath: string, contentType?: string): Promise<void> {
  const { bucket, key } = splitKey(fullKey);
  await s3.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: createReadStream(srcPath), ContentType: contentType })
  );
}

export async function uploadBuffer(fullKey: string, body: Buffer | string, contentType?: string): Promise<void> {
  const { bucket, key } = splitKey(fullKey);
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
}
