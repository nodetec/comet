import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { db } from "~/server/db";
import { assertAdmin } from "~/server/middleware";
import { events } from "@comet/data";

export const listEvents = createServerFn({ method: "GET" })
  .inputValidator(
    (data: { kind?: number; pubkey?: string; cursor?: string }) => data,
  )
  .handler(async ({ data }) => {
    assertAdmin();
    const limit = 50;
    const conditions = [];
    if (data.kind !== undefined) conditions.push(eq(events.kind, data.kind));
    if (data.pubkey !== undefined)
      conditions.push(eq(events.pubkey, data.pubkey));
    if (data.cursor !== undefined)
      conditions.push(lt(events.firstSeen, Number(data.cursor)));

    let query = db
      .select({
        id: events.id,
        pubkey: events.pubkey,
        kind: events.kind,
        createdAt: events.createdAt,
        firstSeen: events.firstSeen,
        content: events.content,
      })
      .from(events)
      .$dynamic();

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const rows = await query.orderBy(desc(events.firstSeen)).limit(limit);

    const items = rows.map((r) => ({
      id: r.id,
      pubkey: r.pubkey,
      kind: r.kind,
      createdAt: r.createdAt,
      firstSeen: r.firstSeen,
      content:
        r.content.length > 200 ? r.content.slice(0, 200) + "\u2026" : r.content,
    }));
    const nextCursor =
      items.length === limit
        ? String(items[items.length - 1].firstSeen)
        : undefined;

    return { events: items, nextCursor };
  });

export const deleteEvents = createServerFn({ method: "POST" })
  .inputValidator((data: { ids: string[] }) => data)
  .handler(async ({ data }) => {
    assertAdmin();
    if (!data.ids?.length) return { deleted: 0 };
    await db.delete(events).where(inArray(events.id, data.ids));
    return { deleted: data.ids.length };
  });
