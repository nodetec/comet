import { createServerFn } from "@tanstack/react-start";
import { db } from "~/server/db";
import { assertAdmin } from "~/server/middleware";
import {
  buildStoredEventsListQuery,
  parseStoredEventCursor,
  type StoredEventRow,
} from "~/server/admin/stored-events";

export const listEvents = createServerFn({ method: "GET" })
  .inputValidator(
    (data: { kind?: number; pubkey?: string; cursor?: string }) => data,
  )
  .handler(async ({ data }) => {
    assertAdmin();
    const limit = 50;

    const rows = await db.execute<StoredEventRow>(
      buildStoredEventsListQuery({
        kind: data.kind,
        pubkey: data.pubkey,
        cursor: parseStoredEventCursor(data.cursor),
        limit,
      }),
    );

    const items = rows.map((row) => ({
      id: row.id,
      pubkey: row.pubkey,
      kind: Number(row.kind),
      createdAt: Number(row.created_at),
      content:
        row.content.length > 200
          ? row.content.slice(0, 200) + "\u2026"
          : row.content,
      source: row.source,
    }));

    const nextCursor =
      items.length === limit
        ? JSON.stringify({
            createdAt: items[items.length - 1].createdAt,
            id: items[items.length - 1].id,
            source: items[items.length - 1].source,
          })
        : undefined;

    return { events: items, nextCursor };
  });
