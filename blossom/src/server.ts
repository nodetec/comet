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
  "Access-Control-Allow-Methods": "GET, HEAD, PUT, DELETE, OPTIONS",
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

async function truncateAll(db: DB): Promise<void> {
  await db.execute(
    rawSql`TRUNCATE blob_owners, blobs, users, invite_codes CASCADE`,
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
        const blob = await blobDb.getBlob(db, blobSha256);
        if (!blob) {
          return json({ error: "not found" }, 404);
        }

        const publicUrl = objectStorage.getPublicUrl(blob.sha256);
        if (shouldProxyBlobResponse(url, publicUrl)) {
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
        const blob = await blobDb.getBlob(db, blobSha256);
        if (!blob) {
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
        const auth = validateBlossomAuth(
          request.headers.get("authorization") ?? undefined,
          "upload",
        );
        if (!auth.ok) {
          return json({ error: auth.reason }, 401);
        }

        const body = await request.arrayBuffer();
        if (body.byteLength === 0) {
          return json({ error: "empty body" }, 400);
        }

        const data = new Uint8Array(body);
        const sha256 = await computeSha256Hex(data);
        const contentType =
          request.headers.get("content-type") ?? "application/octet-stream";

        const [currentUsage, storageLimit, existingBlob, alreadyOwned] =
          await Promise.all([
            blobDb.getBlobTotalSizeByPubkey(db, auth.pubkey),
            blobDb.getStorageLimitForPubkey(db, auth.pubkey),
            blobDb.getBlob(db, sha256),
            blobDb.hasOwner(db, sha256, auth.pubkey),
          ]);

        const additionalUsage = alreadyOwned ? 0 : data.byteLength;
        if (currentUsage + additionalUsage > storageLimit) {
          return json(
            {
              error: "storage limit exceeded",
              usage: currentUsage,
              limit: storageLimit,
              required: additionalUsage,
            },
            507,
          );
        }

        if (!existingBlob) {
          try {
            await objectStorage.uploadBlob(sha256, data, contentType);
          } catch (e) {
            const err = e instanceof Error ? e : new Error(String(e));
            console.error(
              `[blossom] S3 upload failed: ${err.name}: ${err.message}`,
            );
            return json({ error: "storage upload failed" }, 500);
          }
        }

        await blobDb.insertBlob(
          db,
          sha256,
          data.byteLength,
          contentType,
          auth.pubkey,
        );

        return json({
          url: objectStorage.getPublicUrl(sha256),
          sha256,
          size: data.byteLength,
          type: contentType,
          uploaded: Math.floor(Date.now() / 1000),
        });
      }

      // Admin blob deletion — ADMIN_TOKEN auth (no Nostr signing required)
      const adminBlobMatch = url.pathname.match(/^\/admin\/([a-f0-9]{64})$/);
      if (request.method === "DELETE" && adminBlobMatch) {
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

      if (request.method === "DELETE" && blobSha256) {
        const auth = validateBlossomAuth(
          request.headers.get("authorization") ?? undefined,
          "delete",
          { sha256: blobSha256 },
        );
        if (!auth.ok) {
          return json({ error: auth.reason }, 401);
        }

        const blob = await blobDb.getBlob(db, blobSha256);
        if (!blob) {
          return json({ error: "not found" }, 404);
        }

        const removal = await blobDb.removeOwner(db, blobSha256, auth.pubkey);
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
        const auth = validateBlossomAuth(
          request.headers.get("authorization") ?? undefined,
          "list",
        );
        if (!auth.ok) {
          return json({ error: auth.reason }, 401);
        }

        if (auth.pubkey !== listPubkey) {
          return json({ error: "forbidden" }, 403);
        }

        const blobs = await blobDb.listBlobsByPubkey(db, listPubkey);
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
