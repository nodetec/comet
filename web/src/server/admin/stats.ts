import { createServerFn } from "@tanstack/react-start";
import { count, desc, sql, eq } from "drizzle-orm";
import { db } from "~/server/db";
import { assertAdmin } from "~/server/middleware";
import { events, blobs, blobOwners, users } from "@comet/data";

export const getStats = createServerFn({ method: "GET" }).handler(async () => {
  assertAdmin();
  const [[eventRow], [blobRow], [blobSizeRow], [userRow]] = await Promise.all([
    db.select({ val: count() }).from(events),
    db.select({ val: count() }).from(blobs),
    db
      .select({ val: sql<number>`COALESCE(SUM(${blobs.size}), 0)` })
      .from(blobs),
    db.select({ val: count() }).from(users),
  ]);
  return {
    events: Number(eventRow.val),
    blobs: Number(blobRow.val),
    users: Number(userRow.val),
    blobStorage: Number(blobSizeRow.val),
  };
});

export const getEventsByKind = createServerFn({ method: "GET" }).handler(
  async () => {
    assertAdmin();
    const rows = await db
      .select({ kind: events.kind, count: count() })
      .from(events)
      .groupBy(events.kind)
      .orderBy(desc(count()))
      .limit(10);
    return {
      data: rows.map((r) => ({ kind: r.kind, count: Number(r.count) })),
    };
  },
);

export const getEventsOverTime = createServerFn({ method: "GET" }).handler(
  async () => {
    assertAdmin();
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 86400;
    const rows = await db
      .select({
        day: sql<string>`TO_CHAR(TO_TIMESTAMP(${events.createdAt}), 'YYYY-MM-DD')`,
        count: count(),
      })
      .from(events)
      .where(sql`${events.createdAt} >= ${thirtyDaysAgo}`)
      .groupBy(sql`TO_CHAR(TO_TIMESTAMP(${events.createdAt}), 'YYYY-MM-DD')`)
      .orderBy(sql`TO_CHAR(TO_TIMESTAMP(${events.createdAt}), 'YYYY-MM-DD')`);
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
        storage: Number(r.storage),
      })),
    };
  },
);
