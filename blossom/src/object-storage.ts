type ObjectStorageOptions = {
  publicBaseUrl?: string;
};

export type ObjectStorage = {
  publicBaseUrl: string;
  getPublicUrl: (sha256: string) => string;
  downloadBlob: (
    sha256: string,
  ) => Promise<{ data: Uint8Array; contentType?: string }>;
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

function getOptionalEnvValue(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim() !== "") {
      return value;
    }
  }
  return undefined;
}

function parseVirtualHostedStyle(): boolean | undefined {
  const value = process.env.S3_VIRTUAL_HOSTED_STYLE;
  if (value === undefined) {
    return undefined;
  }
  return value === "true";
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
  const accessKeyId = getOptionalEnvValue(
    "S3_ACCESS_KEY_ID",
    "AWS_ACCESS_KEY_ID",
  );
  const secretAccessKey = getOptionalEnvValue(
    "S3_SECRET_ACCESS_KEY",
    "AWS_SECRET_ACCESS_KEY",
  );
  const sessionToken = getOptionalEnvValue(
    "S3_SESSION_TOKEN",
    "AWS_SESSION_TOKEN",
  );
  const virtualHostedStyle = parseVirtualHostedStyle();

  console.log(
    `[blossom] S3 config: bucket="${bucket}", endpoint="${endpoint ?? "(none)"}", region="${region}"`,
  );

  const client = new Bun.S3Client({
    bucket,
    region,
    ...(endpoint ? { endpoint } : {}),
    ...(accessKeyId ? { accessKeyId } : {}),
    ...(secretAccessKey ? { secretAccessKey } : {}),
    ...(sessionToken ? { sessionToken } : {}),
    ...(virtualHostedStyle !== undefined ? { virtualHostedStyle } : {}),
  });

  const publicBaseUrl = getPublicBaseUrl(bucket, options.publicBaseUrl);

  return {
    publicBaseUrl,
    getPublicUrl(sha256: string): string {
      return `${publicBaseUrl}/${sha256}`;
    },
    async downloadBlob(
      sha256: string,
    ): Promise<{ data: Uint8Array; contentType?: string }> {
      const file = client.file(sha256);
      const [buffer, stat] = await Promise.all([
        file.arrayBuffer(),
        file.stat(),
      ]);

      return {
        data: new Uint8Array(buffer),
        contentType: stat.type,
      };
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
      await client.delete(sha256);
    },
  };
}
