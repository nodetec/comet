import { createServerFn } from "@tanstack/react-start";
import { count, eq, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { assertUser } from "~/server/middleware";
import { blobs, blobOwners, syncSnapshots } from "@comet/data";
import {
  buildStoredEventsCountQuery,
  buildStoredEventsByKindQuery,
  buildStoredEventsOverTimeQuery,
  type StoredEventsByKindRow,
  type StoredEventsOverTimeRow,
} from "~/server/admin/stored-events";

export const getUserStats = createServerFn({ method: "GET" }).handler(
  async () => {
    const pubkey = assertUser();

    const [eventRows, blobStats, snapshotRows] = await Promise.all([
      db.execute<{ val: number | string }>(
        buildStoredEventsCountQuery({ pubkey }),
      ),
      db
        .select({
          blobCount: sql<number>`COUNT(DISTINCT ${blobOwners.sha256})`,
          storageUsed: sql<number>`COALESCE(SUM(${blobs.size}), 0)`,
        })
        .from(blobOwners)
        .leftJoin(blobs, eq(blobs.sha256, blobOwners.sha256))
        .where(eq(blobOwners.pubkey, pubkey)),
      db
        .select({ val: count() })
        .from(syncSnapshots)
        .where(eq(syncSnapshots.authorPubkey, pubkey)),
    ]);

    return {
      events: Number(eventRows[0]?.val ?? 0),
      blobs: Number(blobStats[0]?.blobCount ?? 0),
      storage: Number(blobStats[0]?.storageUsed ?? 0),
      snapshots: Number(snapshotRows[0]?.val ?? 0),
    };
  },
);

export const getUserEventsOverTime = createServerFn({ method: "GET" }).handler(
  async () => {
    const pubkey = assertUser();
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 86_400;
    const rows = await db.execute<StoredEventsOverTimeRow>(
      buildStoredEventsOverTimeQuery(thirtyDaysAgo, pubkey),
    );
    return {
      data: rows.map((r) => ({ date: r.day, events: Number(r.count) })),
    };
  },
);

export const getUserEventsByKind = createServerFn({ method: "GET" }).handler(
  async () => {
    const pubkey = assertUser();
    const rows = await db.execute<StoredEventsByKindRow>(
      buildStoredEventsByKindQuery(10, pubkey),
    );
    return {
      data: rows.map((r) => ({ kind: Number(r.kind), count: Number(r.count) })),
    };
  },
);
