import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

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

function getEndpoint(): string | undefined {
  return (
    process.env.S3_ENDPOINT ??
    process.env.AWS_ENDPOINT ??
    process.env.AWS_ENDPOINT_URL_S3
  );
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
  const endpoint = getEndpoint();
  const region = process.env.S3_REGION ?? process.env.AWS_REGION ?? "auto";

  console.log(
    `[blossom] S3 config: bucket="${bucket}", endpoint="${endpoint ?? "(none)"}", region="${region}"`,
  );

  const client = new S3Client({
    region,
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
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
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: sha256,
          Body: data,
          ContentType: contentType ?? "application/octet-stream",
        }),
      );
    },
    async deleteBlob(sha256: string): Promise<void> {
      await client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: sha256,
        }),
      );
    },
  };
}
