import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const internalEndpoint = process.env.S3_ENDPOINT ?? "http://localhost:9000";
// Presigned URLs are consumed by the user's browser, which may reach MinIO
// on a different host than the API container does.
const publicEndpoint = process.env.S3_PUBLIC_ENDPOINT ?? internalEndpoint;

function client(endpoint: string): S3Client {
  return new S3Client({
    endpoint,
    region: process.env.S3_REGION ?? "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? "onepct",
      secretAccessKey: process.env.S3_SECRET_KEY ?? "onepct-secret",
    },
  });
}

export const s3Internal = client(internalEndpoint);
const s3Public = client(publicEndpoint);

export function splitKey(fullKey: string): { bucket: string; key: string } {
  const idx = fullKey.indexOf("/");
  return { bucket: fullKey.slice(0, idx), key: fullKey.slice(idx + 1) };
}

export async function presignUpload(key: string, contentType: string): Promise<string> {
  return getSignedUrl(
    s3Public,
    new PutObjectCommand({ Bucket: "sources", Key: key, ContentType: contentType }),
    { expiresIn: 3600 }
  );
}

export async function presignDownload(fullKey: string): Promise<string> {
  const { bucket, key } = splitKey(fullKey);
  return getSignedUrl(s3Public, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 3600 });
}

export async function getObjectBase64(fullKey: string): Promise<string> {
  const { bucket, key } = splitKey(fullKey);
  const res = await s3Internal.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = await res.Body!.transformToByteArray();
  return Buffer.from(bytes).toString("base64");
}
