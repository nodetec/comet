import { createServerFn } from "@tanstack/react-start";
import { eq, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { assertAdmin } from "~/server/middleware";
import { blobOwners, blobs } from "@comet/data";
import { DEFAULT_STORAGE_LIMIT_BYTES } from "~/lib/utils";
import {
  createRelayAccessKey,
  deleteRelayAccessKey,
  listRelayAccessKeys,
  revokeRelayAccessKey,
} from "~/server/relay-client";

export const listAccessKeys = createServerFn({ method: "GET" }).handler(
  async () => {
    assertAdmin();
    const [keysResponse, usageRows] = await Promise.all([
      listRelayAccessKeys(),
      db
        .select({
          accessKey: blobOwners.accessKey,
          totalSize: sql<number>`COALESCE(SUM(${blobs.size}), 0)`,
        })
        .from(blobOwners)
        .leftJoin(blobs, eq(blobs.sha256, blobOwners.sha256))
        .groupBy(blobOwners.accessKey),
    ]);

    const usageMap = new Map<string, number>();
    for (const row of usageRows) {
      if (row.accessKey) {
        usageMap.set(row.accessKey, row.totalSize);
      }
    }

    return {
      defaultStorageLimitBytes: DEFAULT_STORAGE_LIMIT_BYTES,
      keys: keysResponse.keys.map((key) => ({
        key: key.key,
        label: key.label,
        pubkey: key.pubkey,
        expiresAt: key.expires_at,
        storageLimitBytes: key.storage_limit_bytes,
        revoked: key.revoked,
        createdAt: key.created_at,
        storageUsedBytes: usageMap.get(key.key) ?? 0,
      })),
    };
  },
);

export const createAccessKey = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      label?: string | null;
      pubkey?: string | null;
      expiresAt?: number | null;
      storageLimitBytes?: number | null;
    }) => data,
  )
  .handler(async ({ data }) => {
    assertAdmin();
    return createRelayAccessKey({
      label: data.label ?? null,
      pubkey: data.pubkey ?? null,
      expires_at: data.expiresAt ?? null,
      ...(data.storageLimitBytes !== undefined
        ? { storage_limit_bytes: data.storageLimitBytes }
        : {}),
    });
  });

export const revokeAccessKey = createServerFn({ method: "POST" })
  .inputValidator((data: { key: string }) => data)
  .handler(async ({ data }) => {
    assertAdmin();
    if (!data.key) {
      throw new Error("invalid key");
    }

    return revokeRelayAccessKey(data.key);
  });

export const deleteAccessKey = createServerFn({ method: "POST" })
  .inputValidator((data: { key: string }) => data)
  .handler(async ({ data }) => {
    assertAdmin();
    if (!data.key) {
      throw new Error("invalid key");
    }

    return deleteRelayAccessKey(data.key);
  });
