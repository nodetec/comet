import { createServerFn } from "@tanstack/react-start";
import { count, eq, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { assertAdmin } from "~/server/middleware";
import { users, blobOwners, blobs, events } from "@comet/data";
import { DEFAULT_STORAGE_LIMIT_BYTES } from "~/lib/utils";

export const listUsers = createServerFn({ method: "GET" }).handler(async () => {
  assertAdmin();
  const [blobStats, eventCounts] = await Promise.all([
    db
      .select({
        pubkey: users.pubkey,
        storageLimitBytes: users.storageLimitBytes,
        storageUsedBytes: sql<number>`COALESCE(SUM(${blobs.size}), 0)`,
        blobCount: sql<number>`COUNT(DISTINCT ${blobOwners.sha256})`,
      })
      .from(users)
      .leftJoin(blobOwners, eq(blobOwners.pubkey, users.pubkey))
      .leftJoin(blobs, eq(blobs.sha256, blobOwners.sha256))
      .groupBy(users.pubkey, users.storageLimitBytes)
      .orderBy(sql`COALESCE(SUM(${blobs.size}), 0) DESC`),
    db
      .select({
        userPubkey: sql<string>`COALESCE(${events.recipient}, ${events.pubkey})`,
        eventCount: count(),
      })
      .from(events)
      .groupBy(sql`COALESCE(${events.recipient}, ${events.pubkey})`),
  ]);

  const eventCountMap = new Map<string, number>();
  for (const r of eventCounts) {
    eventCountMap.set(r.userPubkey, Number(r.eventCount));
  }

  return {
    users: blobStats.map((r) => ({
      pubkey: r.pubkey,
      storageUsedBytes: Number(r.storageUsedBytes),
      storageLimitBytes: r.storageLimitBytes,
      blobCount: Number(r.blobCount),
      eventCount: eventCountMap.get(r.pubkey) ?? 0,
    })),
    defaultStorageLimitBytes: DEFAULT_STORAGE_LIMIT_BYTES,
  };
});
