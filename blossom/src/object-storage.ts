import { S3Client } from "bun";

type ObjectStorageOptions = {
  publicBaseUrl?: string;
};

export type ObjectStorage = {
  publicBaseUrl: string;
  getPublicUrl: (sha256: string) => string;
  uploadBlob: (
    sha256: string,
    data: Uint8Array,
    contentType?: string,
  ) => Promise<void>;
  deleteBlob: (sha256: string) => Promise<void>;
};

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function getBucketName(): string {
  const bucket =
    process.env.S3_BUCKET ?? process.env.AWS_BUCKET ?? process.env.BUCKET_NAME;
  if (!bucket) {
    throw new Error("S3 bucket name is required");
  }
  return bucket;
}

function getPublicBaseUrl(bucket: string, override?: string): string {
  const configured =
    override ?? process.env.BLOSSOM_PUBLIC_URL ?? process.env.BUCKET_PUBLIC_URL;
  if (configured) {
    return trimTrailingSlash(configured);
  }

  return `https://${bucket}.fly.storage.tigris.dev`;
}

export function createObjectStorage(
  options: ObjectStorageOptions = {},
): ObjectStorage {
  const bucket = getBucketName();
  const client = new S3Client({
    bucket,
    region: process.env.S3_REGION ?? process.env.AWS_REGION ?? "auto",
    ...(process.env.S3_ENDPOINT
      ? { endpoint: process.env.S3_ENDPOINT }
      : process.env.AWS_ENDPOINT
        ? { endpoint: process.env.AWS_ENDPOINT }
        : process.env.AWS_ENDPOINT_URL_S3
          ? { endpoint: process.env.AWS_ENDPOINT_URL_S3 }
          : {}),
    ...(process.env.S3_ACCESS_KEY_ID
      ? { accessKeyId: process.env.S3_ACCESS_KEY_ID }
      : process.env.AWS_ACCESS_KEY_ID
        ? { accessKeyId: process.env.AWS_ACCESS_KEY_ID }
        : {}),
    ...(process.env.S3_SECRET_ACCESS_KEY
      ? { secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
      : process.env.AWS_SECRET_ACCESS_KEY
        ? { secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }
        : {}),
    ...(process.env.S3_SESSION_TOKEN
      ? { sessionToken: process.env.S3_SESSION_TOKEN }
      : process.env.AWS_SESSION_TOKEN
        ? { sessionToken: process.env.AWS_SESSION_TOKEN }
        : {}),
    ...(process.env.S3_VIRTUAL_HOSTED_STYLE === "true"
      ? { virtualHostedStyle: true }
      : {}),
  });
  const publicBaseUrl = getPublicBaseUrl(bucket, options.publicBaseUrl);

  return {
    publicBaseUrl,
    getPublicUrl(sha256: string): string {
      return `${publicBaseUrl}/${sha256}`;
    },
    async uploadBlob(
      sha256: string,
      data: Uint8Array,
      contentType?: string,
    ): Promise<void> {
      await client.file(sha256).write(data, {
        type: contentType ?? "application/octet-stream",
      });
    },
    async deleteBlob(sha256: string): Promise<void> {
      await client.file(sha256).delete();
    },
  };
}
