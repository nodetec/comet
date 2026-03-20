import { createServerFn } from "@tanstack/react-start";
import { eq, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { assertAdmin } from "~/server/middleware";
import { users, blobOwners, blobs } from "@comet/data";
import { DEFAULT_STORAGE_LIMIT_BYTES } from "~/lib/utils";

export const listAllowedUsers = createServerFn({ method: "GET" }).handler(
  async () => {
    assertAdmin();
    const [allowedList, usageRows] = await Promise.all([
      db
        .select({
          pubkey: users.pubkey,
          expiresAt: users.expiresAt,
          storageLimitBytes: users.storageLimitBytes,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(users.createdAt),
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
      pubkeys: allowedList.map((p) => ({
        pubkey: p.pubkey,
        expiresAt: p.expiresAt,
        storageLimitBytes: p.storageLimitBytes,
        createdAt: p.createdAt,
        storageUsedBytes: usageMap.get(p.pubkey) ?? 0,
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
    const expiresAt = data.expiresAt ?? null;
    const storageLimitBytes = data.storageLimitBytes ?? null;
    const set: Record<string, unknown> = { expiresAt };
    if (data.storageLimitBytes !== undefined) {
      set.storageLimitBytes = storageLimitBytes;
    }
    await db
      .insert(users)
      .values({ pubkey: data.pubkey, expiresAt, storageLimitBytes })
      .onConflictDoUpdate({ target: users.pubkey, set });
    return { allowed: true, pubkey: data.pubkey, expiresAt };
  });

export const revokeUser = createServerFn({ method: "POST" })
  .inputValidator((data: { pubkey: string }) => data)
  .handler(async ({ data }) => {
    assertAdmin();
    if (!data.pubkey || !/^[a-f0-9]{64}$/.test(data.pubkey)) {
      throw new Error("invalid pubkey");
    }
    await db.delete(users).where(eq(users.pubkey, data.pubkey));
    return { revoked: true };
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
    await db
      .update(users)
      .set({ storageLimitBytes: data.storageLimitBytes })
      .where(eq(users.pubkey, data.pubkey));
    return { pubkey: data.pubkey, storageLimitBytes: data.storageLimitBytes };
  });
