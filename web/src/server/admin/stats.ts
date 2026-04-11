import { createServerFn } from "@tanstack/react-start";
import { count, sql, eq } from "drizzle-orm";
import { db } from "~/server/db";
import { assertAdmin } from "~/server/middleware";
import { blobs, blobOwners, accessKeys } from "@comet/data";
import {
  buildStoredEventsByKindQuery,
  buildStoredEventsCountQuery,
  buildStoredEventsOverTimeQuery,
  type StoredEventsByKindRow,
  type StoredEventsOverTimeRow,
} from "~/server/admin/stored-events";

export const getStats = createServerFn({ method: "GET" }).handler(async () => {
  assertAdmin();
  const [[eventRow], [blobRow], [blobSizeRow], [userRow]] = await Promise.all([
    db.execute<{ val: number | string }>(buildStoredEventsCountQuery()),
    db.select({ val: count() }).from(blobs),
    db
      .select({ val: sql<number>`COALESCE(SUM(${blobs.size}), 0)` })
      .from(blobs),
    db.select({ val: count() }).from(accessKeys),
  ]);
  return {
    events: Number(eventRow.val),
    blobs: blobRow.val,
    users: userRow.val,
    blobStorage: blobSizeRow.val,
  };
});

export const getEventsByKind = createServerFn({ method: "GET" }).handler(
  async () => {
    assertAdmin();
    const rows = await db.execute<StoredEventsByKindRow>(
      buildStoredEventsByKindQuery(10),
    );
    return {
      data: rows.map((r) => ({ kind: Number(r.kind), count: Number(r.count) })),
    };
  },
);

export const getEventsOverTime = createServerFn({ method: "GET" }).handler(
  async () => {
    assertAdmin();
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 86_400;
    const rows = await db.execute<StoredEventsOverTimeRow>(
      buildStoredEventsOverTimeQuery(thirtyDaysAgo),
    );
    return {
      data: rows.map((r) => ({ date: r.day, events: Number(r.count) })),
    };
  },
);

export const getStorageByUser = createServerFn({ method: "GET" }).handler(
  async () => {
    assertAdmin();
    const rows = await db
      .select({
        pubkey: blobOwners.pubkey,
        storage: sql<number>`COALESCE(SUM(${blobs.size}), 0)`,
      })
      .from(blobOwners)
      .leftJoin(blobs, eq(blobs.sha256, blobOwners.sha256))
      .groupBy(blobOwners.pubkey)
      .orderBy(sql`COALESCE(SUM(${blobs.size}), 0) DESC`)
      .limit(8);
    return {
      data: rows.map((r) => ({
        pubkey: r.pubkey,
        storage: r.storage,
      })),
    };
  },
);
