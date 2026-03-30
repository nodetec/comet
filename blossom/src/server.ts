import { sql as rawSql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { migrationsFolder } from "@comet/data";
import { validateBlossomAuth } from "@comet/nostr";
import * as blobDb from "./blob-db";
import { computeSha256Hex, parseBlobSha256 } from "./blob";
import { createDB, type DB } from "./db";
import { createObjectStorage, type ObjectStorage } from "./object-storage";

const corsHeaderEntries = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, PUT, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Expose-Headers":
    "Content-Length, Content-Type, X-Content-Sha256",
} as const;

export type BlossomServerOptions = {
  port?: number;
  databaseUrl?: string;
  publicBaseUrl?: string;
  objectStorage?: ObjectStorage;
  resetDatabase?: boolean;
};

export type BlossomRuntime = {
  db: DB;
  sql: ReturnType<typeof createDB>["sql"];
  objectStorage: ReturnType<typeof createObjectStorage>;
  port: number;
  server: ReturnType<typeof Bun.serve>;
  stop: () => Promise<void>;
};

type BlobDescriptor = {
  url: string;
  sha256: string;
  size: number;
  type: string;
  uploaded: number;
};

type UploadBatchManifestItem = {
  part: string;
  sha256: string;
  size?: number;
  type?: string;
  filename?: string;
};

type UploadBatchManifest = {
  uploads: UploadBatchManifestItem[];
};

type StoreBlobSuccess = {
  ok: true;
  descriptor: BlobDescriptor;
  additionalUsage: number;
  alreadyOwned: boolean;
  existingBlob: boolean;
};

type StoreBlobFailure = {
  ok: false;
  status: number;
  body: Record<string, unknown>;
};

function parsePort(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function addCorsHeaders(headers: Headers): Headers {
  const nextHeaders = new Headers(headers);
  for (const [key, value] of Object.entries(corsHeaderEntries)) {
    nextHeaders.set(key, value);
  }
  return nextHeaders;
}

function withCors(response: Response): Response {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: addCorsHeaders(response.headers),
  });
}

function json(data: unknown, status = 200): Response {
  return withCors(Response.json(data, { status }));
}

function text(body: string, status = 200, headers?: HeadersInit): Response {
  return withCors(
    new Response(body, {
      status,
      headers,
    }),
  );
}

function noContent(status = 204): Response {
  return withCors(
    new Response(null, {
      status,
    }),
  );
}

function matchListPubkey(pathname: string): string | null {
  const match = /^\/list\/([a-f0-9]{64})$/.exec(pathname);
  return match ? match[1] : null;
}

function shouldProxyBlobResponse(requestUrl: URL, publicUrl: string): boolean {
  const targetUrl = new URL(publicUrl, requestUrl);
  return (
    targetUrl.origin === requestUrl.origin &&
    targetUrl.pathname === requestUrl.pathname
  );
}

function shortHash(hash: string): string {
  return hash.slice(0, 8);
}

function shortPubkey(pubkey: string): string {
  return pubkey.slice(0, 12);
}

function normalizeMimeType(value: string): string {
  return value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function buildBlobDescriptor(
  objectStorage: ObjectStorage,
  sha256: string,
  size: number,
  type: string | null,
  uploaded: number,
): BlobDescriptor {
  return {
    url: objectStorage.getPublicUrl(sha256),
    sha256,
    size,
    type: type ?? "application/octet-stream",
    uploaded,
  };
}

async function storeBlobForPubkey(
  db: DB,
  objectStorage: ObjectStorage,
  pubkey: string,
  data: Uint8Array,
  contentType: string,
  currentUsage: number,
  storageLimitBytes: number,
): Promise<StoreBlobSuccess | StoreBlobFailure> {
  const sha256 = await computeSha256Hex(data);
  const [existingBlob, alreadyOwned] = await Promise.all([
    blobDb.getBlob(db, sha256),
    blobDb.hasOwner(db, sha256, pubkey),
  ]);

  const additionalUsage = alreadyOwned ? 0 : data.byteLength;
  if (currentUsage + additionalUsage > storageLimitBytes) {
    return {
      ok: false,
      status: 507,
      body: {
        error: "storage limit exceeded",
        usage: currentUsage,
        limit: storageLimitBytes,
        required: additionalUsage,
      },
    };
  }

  if (!existingBlob) {
    try {
      await objectStorage.uploadBlob(sha256, data, contentType);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      console.error(
        `[blossom] storage upload failed hash=${shortHash(sha256)} pubkey=${shortPubkey(pubkey)} error=${err.name}: ${err.message}`,
      );
      return {
        ok: false,
        status: 500,
        body: { error: "storage upload failed" },
      };
    }
  } else {
    console.log(
      `[blossom] upload skipped object-storage write hash=${shortHash(sha256)} reason=existing-blob`,
    );
  }

  await blobDb.insertBlob(db, sha256, data.byteLength, contentType, pubkey);
  const uploaded = existingBlob?.uploaded_at ?? Math.floor(Date.now() / 1000);

  return {
    ok: true,
    descriptor: buildBlobDescriptor(
      objectStorage,
      sha256,
      data.byteLength,
      contentType,
      uploaded,
    ),
    additionalUsage,
    alreadyOwned,
    existingBlob: existingBlob !== null,
  };
}

async function truncateAll(db: DB): Promise<void> {
  await db.execute(
    rawSql`TRUNCATE blob_owners, blobs, relay_allowed_users, invite_codes CASCADE`,
  );
}

export async function createBlossomServer(
  options: BlossomServerOptions = {},
): Promise<BlossomRuntime> {
  const port = options.port ?? parsePort(process.env.PORT, 3001);
  const { db, sql } = createDB(options.databaseUrl);

  await migrate(db, { migrationsFolder });
  if (options.resetDatabase) {
    await truncateAll(db);
  }

  const objectStorage =
    options.objectStorage ??
    createObjectStorage({
      publicBaseUrl: options.publicBaseUrl,
    });

  const server = Bun.serve({
    port,
    async fetch(request) {
      const url = new URL(request.url);
      const blobSha256 = parseBlobSha256(url.pathname);
      const listPubkey = matchListPubkey(url.pathname);

      if (request.method === "OPTIONS") {
        return noContent();
      }

      if (url.pathname === "/healthz") {
        return text("ok");
      }

      if (url.pathname === "/") {
        return text("Comet Blossom");
      }

      if (request.method === "GET" && blobSha256) {
        console.log(`[blossom] get blob hash=${shortHash(blobSha256)}`);
        const blob = await blobDb.getBlob(db, blobSha256);
        if (!blob) {
          console.warn(`[blossom] get missing hash=${shortHash(blobSha256)}`);
          return json({ error: "not found" }, 404);
        }

        const publicUrl = objectStorage.getPublicUrl(blob.sha256);
        if (shouldProxyBlobResponse(url, publicUrl)) {
          console.log(
            `[blossom] get proxy hash=${shortHash(blob.sha256)} public_url=${publicUrl}`,
          );
          try {
            const { data, contentType } = await objectStorage.downloadBlob(
              blob.sha256,
            );
            return withCors(
              new Response(data, {
                status: 200,
                headers: {
                  "Content-Length": String(data.byteLength),
                  "Content-Type": contentType ?? "application/octet-stream",
                  "X-Content-Sha256": blob.sha256,
                },
              }),
            );
          } catch (error) {
            console.error(
              `[blossom] failed to proxy blob ${blob.sha256}: ${String(error)}`,
            );
            return json({ error: "storage download failed" }, 500);
          }
        }

        console.log(
          `[blossom] get redirect hash=${shortHash(blob.sha256)} public_url=${publicUrl}`,
        );

        return withCors(
          new Response(null, {
            status: 302,
            headers: {
              Location: publicUrl,
            },
          }),
        );
      }

      if (request.method === "HEAD" && blobSha256) {
        console.log(`[blossom] head blob hash=${shortHash(blobSha256)}`);
        const blob = await blobDb.getBlob(db, blobSha256);
        if (!blob) {
          console.warn(`[blossom] head missing hash=${shortHash(blobSha256)}`);
          return withCors(new Response(null, { status: 404 }));
        }

        return withCors(
          new Response(null, {
            status: 200,
            headers: {
              "Content-Length": String(blob.size),
              "Content-Type": blob.type ?? "application/octet-stream",
              "X-Content-Sha256": blob.sha256,
            },
          }),
        );
      }

      if (request.method === "PUT" && url.pathname === "/upload") {
        console.log(`[blossom] upload request path=/upload`);
        const auth = validateBlossomAuth(
          request.headers.get("authorization") ?? undefined,
          "upload",
        );
        if (!auth.ok) {
          console.warn(`[blossom] upload auth failed reason=${auth.reason}`);
          return json({ error: auth.reason }, 401);
        }
        console.log(
          `[blossom] upload auth ok pubkey=${shortPubkey(auth.pubkey)}`,
        );

        const body = await request.arrayBuffer();
        if (body.byteLength === 0) {
          console.warn(
            `[blossom] upload rejected pubkey=${shortPubkey(auth.pubkey)} reason=empty-body`,
          );
          return json({ error: "empty body" }, 400);
        }

        const data = new Uint8Array(body);
        const sha256 = await computeSha256Hex(data);
        const contentType =
          request.headers.get("content-type") ?? "application/octet-stream";
        console.log(
          `[blossom] upload parsed pubkey=${shortPubkey(auth.pubkey)} hash=${shortHash(sha256)} bytes=${data.byteLength} type=${contentType}`,
        );

        const [currentUsage, storageLimit] = await Promise.all([
          blobDb.getBlobTotalSizeByPubkey(db, auth.pubkey),
          blobDb.getPubkeyAccessPolicy(db, auth.pubkey),
        ]);

        if (!storageLimit.allowed) {
          console.warn(
            `[blossom] upload forbidden pubkey=${shortPubkey(auth.pubkey)} hash=${shortHash(sha256)} reason=not-allowlisted`,
          );
          return json({ error: "forbidden" }, 403);
        }
        console.log(
          `[blossom] upload access ok pubkey=${shortPubkey(auth.pubkey)} usage=${currentUsage} limit=${storageLimit.storageLimitBytes}`,
        );

        const stored = await storeBlobForPubkey(
          db,
          objectStorage,
          auth.pubkey,
          data,
          contentType,
          currentUsage,
          storageLimit.storageLimitBytes,
        );
        if (!stored.ok) {
          if (stored.status === 507) {
            console.warn(
              `[blossom] upload over-limit pubkey=${shortPubkey(auth.pubkey)} hash=${shortHash(sha256)} usage=${currentUsage} limit=${storageLimit.storageLimitBytes}`,
            );
          }
          return json(stored.body, stored.status);
        }

        console.log(
          `[blossom] upload metadata stored hash=${shortHash(sha256)} pubkey=${shortPubkey(auth.pubkey)} url=${stored.descriptor.url}`,
        );

        return json(stored.descriptor);
      }

      if (request.method === "POST" && url.pathname === "/upload-batch") {
        console.log(`[blossom] batch upload request path=/upload-batch`);

        let formData: FormData;
        try {
          formData = await request.formData();
        } catch {
          return json({ error: "invalid multipart form data" }, 400);
        }

        const manifestValue = formData.get("manifest");
        if (manifestValue === null) {
          return json({ error: "missing manifest" }, 400);
        }

        const manifestText =
          typeof manifestValue === "string"
            ? manifestValue
            : manifestValue instanceof Blob
              ? await manifestValue.text()
              : null;
        if (manifestText === null) {
          return json({ error: "invalid manifest" }, 400);
        }

        let manifest: UploadBatchManifest;
        try {
          manifest = JSON.parse(manifestText) as UploadBatchManifest;
        } catch {
          return json({ error: "invalid manifest json" }, 400);
        }

        if (!Array.isArray(manifest.uploads) || manifest.uploads.length === 0) {
          return json(
            { error: "manifest uploads must be a non-empty array" },
            400,
          );
        }

        const hashes = manifest.uploads.map((item) => item.sha256);
        const auth = validateBlossomAuth(
          request.headers.get("authorization") ?? undefined,
          "upload",
          { sha256s: hashes },
        );
        if (!auth.ok) {
          console.warn(
            `[blossom] batch upload auth failed reason=${auth.reason}`,
          );
          return json({ error: auth.reason }, 401);
        }

        const accessPolicy = await blobDb.getPubkeyAccessPolicy(
          db,
          auth.pubkey,
        );
        if (!accessPolicy.allowed) {
          console.warn(
            `[blossom] batch upload forbidden pubkey=${shortPubkey(auth.pubkey)} reason=not-allowlisted`,
          );
          return json({ error: "forbidden" }, 403);
        }

        const parsedUploads = [];
        for (const item of manifest.uploads) {
          if (
            typeof item.part !== "string" ||
            typeof item.sha256 !== "string" ||
            item.part.length === 0 ||
            item.sha256.length !== 64
          ) {
            return json({ error: "invalid manifest upload item" }, 400);
          }

          const part = formData.get(item.part);
          if (!(part instanceof Blob)) {
            return json(
              { error: `missing file part for manifest item "${item.part}"` },
              400,
            );
          }

          const data = new Uint8Array(await part.arrayBuffer());
          const computedSha256 = await computeSha256Hex(data);
          if (computedSha256 !== item.sha256) {
            return json(
              { error: `sha256 mismatch for manifest item "${item.part}"` },
              400,
            );
          }

          if (item.size !== undefined && item.size !== data.byteLength) {
            return json(
              { error: `size mismatch for manifest item "${item.part}"` },
              400,
            );
          }

          const contentType =
            part.type || (item.type ?? "application/octet-stream");
          if (
            item.type !== undefined &&
            part.type &&
            normalizeMimeType(item.type) !== normalizeMimeType(part.type)
          ) {
            return json(
              {
                error: `content-type mismatch for manifest item "${item.part}"`,
              },
              400,
            );
          }

          parsedUploads.push({
            part: item.part,
            sha256: item.sha256,
            data,
            contentType,
          });
        }

        let usage = await blobDb.getBlobTotalSizeByPubkey(db, auth.pubkey);
        console.log(
          `[blossom] batch upload access ok pubkey=${shortPubkey(auth.pubkey)} usage=${usage} limit=${accessPolicy.storageLimitBytes} uploads=${parsedUploads.length}`,
        );

        const results: Array<{
          part: string;
          status: number;
          descriptor?: BlobDescriptor;
          error?: string;
        }> = [];

        for (const item of parsedUploads) {
          const stored = await storeBlobForPubkey(
            db,
            objectStorage,
            auth.pubkey,
            item.data,
            item.contentType,
            usage,
            accessPolicy.storageLimitBytes,
          );

          if (!stored.ok) {
            results.push({
              part: item.part,
              status: stored.status,
              error:
                typeof stored.body.error === "string"
                  ? stored.body.error
                  : "upload failed",
            });
            continue;
          }

          usage += stored.additionalUsage;
          results.push({
            part: item.part,
            status: 200,
            descriptor: stored.descriptor,
          });
        }

        const hasFailures = results.some((result) => result.status !== 200);
        return json({ results }, hasFailures ? 207 : 200);
      }

      // Admin blob deletion — ADMIN_TOKEN auth (no Nostr signing required)
      const adminBlobMatch = url.pathname.match(/^\/admin\/([a-f0-9]{64})$/);
      const adminUserBlobMatch = url.pathname.match(
        /^\/admin\/users\/([a-f0-9]{64})\/blobs$/,
      );
      if (request.method === "DELETE" && adminBlobMatch) {
        console.log(
          `[blossom] admin delete request hash=${shortHash(adminBlobMatch[1])}`,
        );
        const adminToken = process.env.ADMIN_TOKEN;
        if (!adminToken) {
          return json({ error: "admin not configured" }, 503);
        }
        const auth = request.headers.get("authorization");
        if (auth !== `Bearer ${adminToken}`) {
          return json({ error: "unauthorized" }, 401);
        }
        const sha256 = adminBlobMatch[1];
        const blob = await blobDb.getBlob(db, sha256);
        if (!blob) {
          return json({ error: "not found" }, 404);
        }
        await objectStorage.deleteBlob(sha256);
        await blobDb.deleteBlob(db, sha256);
        return json({ deleted: true });
      }

      if (request.method === "DELETE" && adminUserBlobMatch) {
        const pubkey = adminUserBlobMatch[1];
        console.log(
          `[blossom] admin purge blobs request pubkey=${shortPubkey(pubkey)}`,
        );
        const adminToken = process.env.ADMIN_TOKEN;
        if (!adminToken) {
          return json({ error: "admin not configured" }, 503);
        }
        const auth = request.headers.get("authorization");
        if (auth !== `Bearer ${adminToken}`) {
          return json({ error: "unauthorized" }, 401);
        }

        const ownedBlobs = await blobDb.listBlobsByPubkey(db, pubkey);
        let deletedBlobs = 0;
        let releasedSharedBlobs = 0;
        let deletedBytes = 0;

        for (const blob of ownedBlobs) {
          const ownerCount = await blobDb.getOwnerCount(db, blob.sha256);

          if (ownerCount <= 1) {
            await objectStorage.deleteBlob(blob.sha256);
            const removal = await blobDb.removeOwner(db, blob.sha256, pubkey);
            if (removal === "removed") {
              throw new Error(
                `blob owner set changed during purge for ${blob.sha256}`,
              );
            }
            if (removal === "removed_last_owner") {
              await blobDb.deleteBlob(db, blob.sha256);
              deletedBlobs += 1;
              deletedBytes += blob.size;
            }
            continue;
          }

          const removal = await blobDb.removeOwner(db, blob.sha256, pubkey);
          if (removal === "removed_last_owner") {
            await objectStorage.deleteBlob(blob.sha256);
            await blobDb.deleteBlob(db, blob.sha256);
            deletedBlobs += 1;
            deletedBytes += blob.size;
          } else if (removal === "removed") {
            releasedSharedBlobs += 1;
          }
        }

        return json({
          pubkey,
          processedBlobs: ownedBlobs.length,
          deletedBlobs,
          releasedSharedBlobs,
          deletedBytes,
        });
      }

      if (request.method === "DELETE" && blobSha256) {
        console.log(`[blossom] delete request hash=${shortHash(blobSha256)}`);
        const auth = validateBlossomAuth(
          request.headers.get("authorization") ?? undefined,
          "delete",
          { sha256: blobSha256 },
        );
        if (!auth.ok) {
          console.warn(`[blossom] delete auth failed reason=${auth.reason}`);
          return json({ error: auth.reason }, 401);
        }
        console.log(
          `[blossom] delete auth ok pubkey=${shortPubkey(auth.pubkey)}`,
        );
        const accessPolicy = await blobDb.getPubkeyAccessPolicy(
          db,
          auth.pubkey,
        );
        if (!accessPolicy.allowed) {
          console.warn(
            `[blossom] delete forbidden pubkey=${shortPubkey(auth.pubkey)} hash=${shortHash(blobSha256)} reason=not-allowlisted`,
          );
          return json({ error: "forbidden" }, 403);
        }

        const blob = await blobDb.getBlob(db, blobSha256);
        if (!blob) {
          return json({ error: "not found" }, 404);
        }

        const removal = await blobDb.removeOwner(db, blobSha256, auth.pubkey);
        console.log(
          `[blossom] delete owner removal hash=${shortHash(blobSha256)} pubkey=${shortPubkey(auth.pubkey)} result=${removal}`,
        );
        if (removal === "not_owner") {
          return json({ error: "forbidden" }, 403);
        }

        if (removal === "removed_last_owner") {
          await objectStorage.deleteBlob(blobSha256);
          await blobDb.deleteBlob(db, blobSha256);
        }

        return json({ deleted: true });
      }

      if (request.method === "GET" && listPubkey) {
        console.log(`[blossom] list request pubkey=${shortPubkey(listPubkey)}`);
        const auth = validateBlossomAuth(
          request.headers.get("authorization") ?? undefined,
          "list",
        );
        if (!auth.ok) {
          console.warn(`[blossom] list auth failed reason=${auth.reason}`);
          return json({ error: auth.reason }, 401);
        }
        console.log(
          `[blossom] list auth ok pubkey=${shortPubkey(auth.pubkey)}`,
        );
        const accessPolicy = await blobDb.getPubkeyAccessPolicy(
          db,
          auth.pubkey,
        );
        if (!accessPolicy.allowed) {
          console.warn(
            `[blossom] list forbidden pubkey=${shortPubkey(auth.pubkey)} reason=not-allowlisted`,
          );
          return json({ error: "forbidden" }, 403);
        }

        if (auth.pubkey !== listPubkey) {
          return json({ error: "forbidden" }, 403);
        }

        const blobs = await blobDb.listBlobsByPubkey(db, listPubkey);
        console.log(
          `[blossom] list ok pubkey=${shortPubkey(listPubkey)} count=${blobs.length}`,
        );
        return json(
          blobs.map((blob) => ({
            url: objectStorage.getPublicUrl(blob.sha256),
            sha256: blob.sha256,
            size: blob.size,
            type: blob.type,
            uploaded: blob.uploaded_at,
          })),
        );
      }

      return text("Not Found", 404);
    },
  });

  return {
    db,
    sql,
    objectStorage,
    port: server.port ?? port,
    server,
    stop: async () => {
      await server.stop(true);
      await sql.end({ timeout: 1 });
    },
  };
}
