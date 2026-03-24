import { createServerFn } from "@tanstack/react-start";
import { eq, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { assertAdmin } from "~/server/middleware";
import { blobOwners, blobs } from "@comet/data";
import { DEFAULT_STORAGE_LIMIT_BYTES } from "~/lib/utils";
import {
  allowRelayUser,
  listRelayAllowedUsers,
  revokeRelayUser,
} from "~/server/relay-client";

export const listAllowedUsers = createServerFn({ method: "GET" }).handler(
  async () => {
    assertAdmin();
    const [allowlistResponse, usageRows] = await Promise.all([
      listRelayAllowedUsers(),
      db
        .select({
          pubkey: blobOwners.pubkey,
          totalSize: sql<number>`COALESCE(SUM(${blobs.size}), 0)`,
        })
        .from(blobOwners)
        .leftJoin(blobs, eq(blobs.sha256, blobOwners.sha256))
        .groupBy(blobOwners.pubkey),
    ]);

    const usageMap = new Map<string, number>();
    for (const row of usageRows) {
      usageMap.set(row.pubkey, Number(row.totalSize));
    }

    return {
      defaultStorageLimitBytes: DEFAULT_STORAGE_LIMIT_BYTES,
      pubkeys: allowlistResponse.users.map((user) => ({
        pubkey: user.pubkey,
        expiresAt: user.expires_at,
        storageLimitBytes: user.storage_limit_bytes,
        createdAt: user.created_at,
        storageUsedBytes: usageMap.get(user.pubkey) ?? 0,
      })),
    };
  },
);

export const allowUser = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      pubkey: string;
      expiresAt?: number | null;
      storageLimitBytes?: number | null;
    }) => data,
  )
  .handler(async ({ data }) => {
    assertAdmin();
    if (!data.pubkey || !/^[a-f0-9]{64}$/.test(data.pubkey)) {
      throw new Error("invalid pubkey: must be 64-char hex");
    }

    return allowRelayUser({
      pubkey: data.pubkey,
      expires_at: data.expiresAt ?? null,
      ...(data.storageLimitBytes !== undefined
        ? { storage_limit_bytes: data.storageLimitBytes }
        : {}),
    });
  });

export const revokeUser = createServerFn({ method: "POST" })
  .inputValidator((data: { pubkey: string }) => data)
  .handler(async ({ data }) => {
    assertAdmin();
    if (!data.pubkey || !/^[a-f0-9]{64}$/.test(data.pubkey)) {
      throw new Error("invalid pubkey");
    }

    return revokeRelayUser(data.pubkey);
  });

export const setStorageLimit = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { pubkey: string; storageLimitBytes: number | null }) => data,
  )
  .handler(async ({ data }) => {
    assertAdmin();
    if (!data.pubkey || !/^[a-f0-9]{64}$/.test(data.pubkey)) {
      throw new Error("invalid pubkey");
    }

    return allowRelayUser({
      pubkey: data.pubkey,
      storage_limit_bytes: data.storageLimitBytes,
    });
  });
