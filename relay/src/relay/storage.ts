import { eq, and, lt, lte, desc, count, max, min } from "drizzle-orm";
import {
  changeTags,
  changes,
  deletedCoords,
  deletedEvents,
  events,
  eventTags,
} from "@comet/data";
import type { NostrEvent, Filter, ChangeEntry, ChangesFilter } from "../types";
import type { DB } from "../db";
import { getEventKindCategory } from "./event";
import {
  isDeletionEvent,
  getDeletionTargetIds,
  getDeletionTargetAddrs,
} from "./nip/09";
import { KIND_GIFT_WRAP, canDeleteGiftWrap, isGiftWrap } from "./nip/59";

/**
 * Build a SQL condition for a column that supports both exact (64-char) and prefix matching.
 * NIP-01: filter ids and authors can be hex prefixes of any even length.
 */
function buildPrefixCondition(
  column: string,
  values: string[],
  params: QueryParam[],
  paramIdx: number,
): { sql: string; nextIdx: number } {
  const exact: string[] = [];
  const prefixes: string[] = [];
  for (const v of values) {
    if (v.length === 64) {
      exact.push(v);
    } else {
      prefixes.push(v);
    }
  }

  const parts: string[] = [];
  if (exact.length > 0) {
    parts.push(`${column} = ANY($${paramIdx})`);
    params.push(exact);
    paramIdx++;
  }
  for (const prefix of prefixes) {
    parts.push(`${column} LIKE $${paramIdx}`);
    params.push(`${prefix}%`);
    paramIdx++;
  }

  const combined = parts.length === 1 ? parts[0] : `(${parts.join(" OR ")})`;
  return { sql: combined, nextIdx: paramIdx };
}

export interface Storage {
  saveEvent(
    event: NostrEvent,
  ): Promise<{ saved: boolean; reason?: string; changes: ChangeEntry[] }>;
  queryEvents(filters: Filter[]): Promise<NostrEvent[]>;
  deleteEvent(id: string): Promise<boolean>;
  processDeletionRequest(
    event: NostrEvent,
  ): Promise<{ deleted: number; changes: ChangeEntry[] }>;
  isEventDeleted(id: string): Promise<boolean>;
  queryChanges(filter: ChangesFilter): Promise<ChangeEntry[]>;
  getMaxSeq(): Promise<number>;
  getMinSeq(): Promise<number>;
  getEventCount(): Promise<number>;
}

type SingleLetterTag = [string, string];
type QueryParam = string | number | string[] | number[];
type UnsafeQueryParam = string | number | string[];
type EventRow = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][] | string;
  content: string;
  sig: string;
};
type ChangeRow = {
  seq: number;
  event_id: string;
  type: "STORED" | "DELETED";
  kind: number;
  pubkey: string;
  reason: string | ChangeEntry["reason"] | null;
};

function parseEventTags(value: string[][] | string): string[][] {
  return typeof value === "string" ? (JSON.parse(value) as string[][]) : value;
}

function parseChangeReason(
  value: string | ChangeEntry["reason"] | null,
): ChangeEntry["reason"] {
  if (value === null) {
    return null;
  }

  return typeof value === "string"
    ? (JSON.parse(value) as ChangeEntry["reason"])
    : value;
}

function toUnsafeQueryParams(params: QueryParam[]): UnsafeQueryParam[] {
  return params as unknown as UnsafeQueryParam[];
}

function extractSingleLetterTags(tags: string[][]): SingleLetterTag[] {
  return tags
    .filter((t) => t.length >= 2 && t[0].length === 1)
    .map((t) => [t[0], t[1]]);
}

export function initStorage(db: DB): Storage {
  async function recordChange(
    tx: DB,
    eventId: string,
    type: "STORED" | "DELETED",
    kind: number,
    pubkey: string,
    reason: object | null,
    tags: SingleLetterTag[],
  ): Promise<ChangeEntry> {
    const reasonJson = reason ? JSON.stringify(reason) : null;
    const [row] = await tx
      .insert(changes)
      .values({
        eventId,
        type,
        kind,
        pubkey,
        reason: reasonJson,
        tags: tags.length > 0 ? tags : null,
      })
      .returning({ seq: changes.seq });

    if (tags.length > 0) {
      await tx.insert(changeTags).values(
        tags.map(([name, value]) => ({
          seq: row.seq,
          tagName: name,
          tagValue: value,
        })),
      );
    }
    return {
      seq: row.seq,
      eventId,
      type,
      kind,
      pubkey,
      reason: reason as ChangeEntry["reason"],
      tags,
    };
  }

  async function insertEventWithTags(tx: DB, event: NostrEvent): Promise<void> {
    const recipient = isGiftWrap(event)
      ? (event.tags.find(([t]) => t === "p")?.[1] ?? null)
      : null;
    const dTagValue = event.tags.find(([t]) => t === "d")?.[1] ?? null;

    await tx
      .insert(events)
      .values({
        id: event.id,
        pubkey: event.pubkey,
        recipient,
        dTag: dTagValue,
        createdAt: event.created_at,
        kind: event.kind,
        tags: event.tags,
        content: event.content,
        sig: event.sig,
        firstSeen: Math.floor(Date.now() / 1000),
      })
      .onConflictDoNothing();

    const tagRows = event.tags
      .filter((tag) => tag.length >= 2 && tag[0].length === 1)
      .map((tag) => ({ eventId: event.id, tagName: tag[0], tagValue: tag[1] }));
    if (tagRows.length > 0) {
      await tx.insert(eventTags).values(tagRows);
    }
  }

  async function saveEvent(
    event: NostrEvent,
  ): Promise<{ saved: boolean; reason?: string; changes: ChangeEntry[] }> {
    const category = getEventKindCategory(event.kind);

    if (category === "ephemeral") {
      return {
        saved: false,
        reason: "ephemeral events are not stored",
        changes: [],
      };
    }

    if (await isEventDeleted(event.id)) {
      return {
        saved: false,
        reason: "deleted: this event has been deleted",
        changes: [],
      };
    }

    // Replaceable gift wraps: kind:1059 with both p-tag and d-tag
    if (isGiftWrap(event)) {
      const pTag = event.tags.find(([t]) => t === "p")?.[1];
      const dTag = event.tags.find(([t]) => t === "d")?.[1];

      if (pTag && dTag) {
        const allChanges: ChangeEntry[] = [];
        await db.transaction(async (tx) => {
          // Find old gift wraps with same recipient+d_tag
          const oldEvents = await tx
            .select({ id: events.id })
            .from(events)
            .where(
              and(
                eq(events.kind, KIND_GIFT_WRAP),
                eq(events.recipient, pTag),
                eq(events.dTag, dTag),
              ),
            );

          for (const old of oldEvents) {
            await tx.delete(events).where(eq(events.id, old.id));
          }
          await insertEventWithTags(tx as unknown as DB, event);
          allChanges.push(
            await recordChange(
              tx as unknown as DB,
              event.id,
              "STORED",
              event.kind,
              event.pubkey,
              null,
              extractSingleLetterTags(event.tags),
            ),
          );
        });
        return { saved: true, changes: allChanges };
      }
    }

    // NIP-09: for addressable events, check if the coordinate has been deleted
    if (category === "addressable") {
      const dTag = event.tags.find(([t]) => t === "d")?.[1] ?? "";
      const deletedCoordRows = await db
        .select({ deletedUpTo: deletedCoords.deletedUpTo })
        .from(deletedCoords)
        .where(
          and(
            eq(deletedCoords.kind, event.kind),
            eq(deletedCoords.pubkey, event.pubkey),
            eq(deletedCoords.dTag, dTag),
          ),
        );
      if (
        deletedCoordRows.length > 0 &&
        event.created_at <= deletedCoordRows[0].deletedUpTo
      ) {
        return {
          saved: false,
          reason: "deleted: this addressable event has been deleted",
          changes: [],
        };
      }
    }

    if (category === "replaceable") {
      const existingRows = await db
        .select({ createdAt: events.createdAt })
        .from(events)
        .where(
          and(eq(events.pubkey, event.pubkey), eq(events.kind, event.kind)),
        )
        .orderBy(desc(events.createdAt))
        .limit(1);

      if (
        existingRows.length > 0 &&
        existingRows[0].createdAt >= event.created_at
      ) {
        return {
          saved: false,
          reason: "duplicate: a newer replaceable event exists",
          changes: [],
        };
      }

      const allChanges: ChangeEntry[] = [];
      await db.transaction(async (tx) => {
        const oldEvents = await tx
          .select({
            id: events.id,
            kind: events.kind,
            pubkey: events.pubkey,
            tags: events.tags,
          })
          .from(events)
          .where(
            and(
              eq(events.pubkey, event.pubkey),
              eq(events.kind, event.kind),
              lt(events.createdAt, event.created_at),
            ),
          );

        await tx
          .delete(events)
          .where(
            and(
              eq(events.pubkey, event.pubkey),
              eq(events.kind, event.kind),
              lt(events.createdAt, event.created_at),
            ),
          );
        await insertEventWithTags(tx as unknown as DB, event);
        for (const old of oldEvents) {
          const oldTags = extractSingleLetterTags(old.tags);
          allChanges.push(
            await recordChange(
              tx as unknown as DB,
              old.id,
              "DELETED",
              old.kind,
              old.pubkey,
              { superseded_by: event.id },
              oldTags,
            ),
          );
        }
        allChanges.push(
          await recordChange(
            tx as unknown as DB,
            event.id,
            "STORED",
            event.kind,
            event.pubkey,
            null,
            extractSingleLetterTags(event.tags),
          ),
        );
      });
      return { saved: true, changes: allChanges };
    }

    if (category === "addressable") {
      const dTag = event.tags.find(([t]) => t === "d")?.[1] ?? "";

      const existingRows = await db
        .select({ createdAt: events.createdAt })
        .from(events)
        .where(
          and(
            eq(events.pubkey, event.pubkey),
            eq(events.kind, event.kind),
            eq(events.dTag, dTag),
          ),
        )
        .orderBy(desc(events.createdAt))
        .limit(1);

      if (
        existingRows.length > 0 &&
        existingRows[0].createdAt >= event.created_at
      ) {
        return {
          saved: false,
          reason: "duplicate: a newer addressable event exists",
          changes: [],
        };
      }

      const allChanges: ChangeEntry[] = [];
      await db.transaction(async (tx) => {
        const oldEvents = await tx
          .select({
            id: events.id,
            kind: events.kind,
            pubkey: events.pubkey,
            tags: events.tags,
          })
          .from(events)
          .where(
            and(
              eq(events.pubkey, event.pubkey),
              eq(events.kind, event.kind),
              eq(events.dTag, dTag),
              lt(events.createdAt, event.created_at),
            ),
          );

        for (const old of oldEvents) {
          await tx.delete(events).where(eq(events.id, old.id));
        }
        await insertEventWithTags(tx as unknown as DB, event);
        for (const old of oldEvents) {
          const oldTags = extractSingleLetterTags(old.tags);
          allChanges.push(
            await recordChange(
              tx as unknown as DB,
              old.id,
              "DELETED",
              old.kind,
              old.pubkey,
              { superseded_by: event.id },
              oldTags,
            ),
          );
        }
        allChanges.push(
          await recordChange(
            tx as unknown as DB,
            event.id,
            "STORED",
            event.kind,
            event.pubkey,
            null,
            extractSingleLetterTags(event.tags),
          ),
        );
      });
      return { saved: true, changes: allChanges };
    }

    // Regular event
    const existingRows = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.id, event.id));
    if (existingRows.length > 0) {
      return {
        saved: false,
        reason: "duplicate: event already exists",
        changes: [],
      };
    }

    const allChanges: ChangeEntry[] = [];
    await db.transaction(async (tx) => {
      await insertEventWithTags(tx as unknown as DB, event);
      allChanges.push(
        await recordChange(
          tx as unknown as DB,
          event.id,
          "STORED",
          event.kind,
          event.pubkey,
          null,
          extractSingleLetterTags(event.tags),
        ),
      );
    });
    return { saved: true, changes: allChanges };
  }

  async function queryEvents(filters: Filter[]): Promise<NostrEvent[]> {
    if (filters.length === 0) {
      return [];
    }

    const results = new Map<string, NostrEvent>();

    // queryEvents uses dynamic SQL because Nostr filters have variable structure
    // (tag filters create EXISTS subqueries). Drizzle's query builder doesn't
    // compose well for this pattern, so we use the underlying sql template.
    const rawSql = db.$client;

    for (const filter of filters) {
      const conditions: string[] = ["TRUE"];
      const params: QueryParam[] = [];
      let paramIdx = 1;

      if (filter.ids && filter.ids.length > 0) {
        const cond = buildPrefixCondition("e.id", filter.ids, params, paramIdx);
        conditions.push(cond.sql);
        paramIdx = cond.nextIdx;
      }
      if (filter.authors && filter.authors.length > 0) {
        const cond = buildPrefixCondition(
          "e.pubkey",
          filter.authors,
          params,
          paramIdx,
        );
        conditions.push(cond.sql);
        paramIdx = cond.nextIdx;
      }
      if (filter.kinds && filter.kinds.length > 0) {
        conditions.push(`e.kind = ANY($${paramIdx})`);
        params.push(filter.kinds);
        paramIdx++;
      }
      if (filter.since !== undefined) {
        conditions.push(`e.created_at >= $${paramIdx}`);
        params.push(filter.since);
        paramIdx++;
      }
      if (filter.until !== undefined) {
        conditions.push(`e.created_at <= $${paramIdx}`);
        params.push(filter.until);
        paramIdx++;
      }

      for (const key of Object.keys(filter)) {
        if (key[0] === "#") {
          const tagName = key.slice(1);
          const values = filter[key as `#${string}`];
          if (!Array.isArray(values) || values.length === 0) {
            continue;
          }
          conditions.push(
            `EXISTS (SELECT 1 FROM event_tags t WHERE t.event_id = e.id AND t.tag_name = $${paramIdx} AND t.tag_value = ANY($${paramIdx + 1}))`,
          );
          params.push(tagName, values);
          paramIdx += 2;
        }
      }

      const where = conditions.join(" AND ");
      const limitClause =
        filter.limit !== undefined ? `LIMIT ${Math.max(0, filter.limit)}` : "";

      const rows = await rawSql.unsafe<EventRow[]>(
        `SELECT e.id, e.pubkey, e.created_at, e.kind, e.tags, e.content, e.sig FROM events e WHERE ${where} ORDER BY e.created_at DESC ${limitClause}`,
        toUnsafeQueryParams(params),
      );

      for (const row of rows) {
        if (!results.has(row.id)) {
          results.set(row.id, {
            id: row.id,
            pubkey: row.pubkey,
            created_at: row.created_at,
            kind: row.kind,
            tags: parseEventTags(row.tags),
            content: row.content,
            sig: row.sig,
          });
        }
      }
    }

    return Array.from(results.values()).sort((a, b) => {
      if (a.created_at !== b.created_at) {
        return b.created_at - a.created_at;
      }
      return a.id.localeCompare(b.id);
    });
  }

  async function deleteEvent(id: string): Promise<boolean> {
    const result = await db
      .delete(events)
      .where(eq(events.id, id))
      .returning({ id: events.id });
    return result.length > 0;
  }

  async function processDeletionRequest(
    event: NostrEvent,
  ): Promise<{ deleted: number; changes: ChangeEntry[] }> {
    if (!isDeletionEvent(event)) {
      return { deleted: 0, changes: [] };
    }

    let deleted = 0;
    const allChanges: ChangeEntry[] = [];

    await db.transaction(async (tx) => {
      const targetIds = getDeletionTargetIds(event);
      for (const targetId of targetIds) {
        const targetEventRows = await tx
          .select({
            pubkey: events.pubkey,
            kind: events.kind,
            tags: events.tags,
          })
          .from(events)
          .where(eq(events.id, targetId));
        const targetEvent =
          targetEventRows.length > 0 ? targetEventRows[0] : null;

        let authorized = false;
        if (targetEvent !== null) {
          if (targetEvent.kind === KIND_GIFT_WRAP) {
            authorized = canDeleteGiftWrap(
              { tags: targetEvent.tags },
              event.pubkey,
            );
          } else {
            authorized = targetEvent.pubkey === event.pubkey;
          }
        }

        if (targetEvent !== null && authorized) {
          const targetTags = extractSingleLetterTags(targetEvent.tags);
          await tx.delete(events).where(eq(events.id, targetId));
          deleted++;
          allChanges.push(
            await recordChange(
              tx as unknown as DB,
              targetId,
              "DELETED",
              targetEvent.kind,
              event.pubkey,
              { deletion_id: event.id },
              targetTags,
            ),
          );
        }

        await tx
          .insert(deletedEvents)
          .values({
            eventId: targetId,
            deletionId: event.id,
            pubkey: event.pubkey,
          })
          .onConflictDoNothing();
      }

      const addrTargets = getDeletionTargetAddrs(event);
      for (const addr of addrTargets) {
        if (addr.pubkey !== event.pubkey) {
          continue;
        }

        const affected = await tx
          .select({
            id: events.id,
            kind: events.kind,
            pubkey: events.pubkey,
            tags: events.tags,
          })
          .from(events)
          .where(
            and(
              eq(events.pubkey, addr.pubkey),
              eq(events.kind, addr.kind),
              eq(events.dTag, addr.dTag),
              lte(events.createdAt, event.created_at),
            ),
          );

        for (const a of affected) {
          await tx.delete(events).where(eq(events.id, a.id));
          const aTags = extractSingleLetterTags(a.tags);
          allChanges.push(
            await recordChange(
              tx as unknown as DB,
              a.id,
              "DELETED",
              a.kind,
              a.pubkey,
              { deletion_id: event.id },
              aTags,
            ),
          );
        }
        deleted += affected.length;

        // Upsert deleted coord — use raw SQL for GREATEST()
        await (tx as unknown as DB).$client`
          INSERT INTO deleted_coords (kind, pubkey, d_tag, deleted_up_to, deletion_id)
          VALUES (${addr.kind}, ${addr.pubkey}, ${addr.dTag}, ${event.created_at}, ${event.id})
          ON CONFLICT (kind, pubkey, d_tag) DO UPDATE SET
            deleted_up_to = GREATEST(deleted_coords.deleted_up_to, EXCLUDED.deleted_up_to),
            deletion_id = EXCLUDED.deletion_id
        `;
      }
    });

    return { deleted, changes: allChanges };
  }

  async function isEventDeleted(id: string): Promise<boolean> {
    const rows = await db
      .select({ eventId: deletedEvents.eventId })
      .from(deletedEvents)
      .where(eq(deletedEvents.eventId, id));
    return rows.length > 0;
  }

  async function queryChanges(filter: ChangesFilter): Promise<ChangeEntry[]> {
    // Dynamic query — same pattern as queryEvents
    const rawSql = db.$client;
    const conditions: string[] = ["TRUE"];
    const params: QueryParam[] = [];
    let paramIdx = 1;

    const since = filter.since ?? 0;
    conditions.push(`c.seq > $${paramIdx}`);
    params.push(since);
    paramIdx++;

    if (filter.until_seq !== undefined) {
      conditions.push(`c.seq <= $${paramIdx}`);
      params.push(filter.until_seq);
      paramIdx++;
    }
    if (filter.kinds && filter.kinds.length > 0) {
      conditions.push(`c.kind = ANY($${paramIdx})`);
      params.push(filter.kinds);
      paramIdx++;
    }
    if (filter.authors && filter.authors.length > 0) {
      const cond = buildPrefixCondition(
        "c.pubkey",
        filter.authors,
        params,
        paramIdx,
      );
      conditions.push(cond.sql);
      paramIdx = cond.nextIdx;
    }

    for (const key of Object.keys(filter)) {
      if (key[0] === "#") {
        const tagName = key.slice(1);
        const values = filter[key as `#${string}`];
        if (!Array.isArray(values) || values.length === 0) {
          continue;
        }
        conditions.push(
          `EXISTS (SELECT 1 FROM change_tags ct WHERE ct.seq = c.seq AND ct.tag_name = $${paramIdx} AND ct.tag_value = ANY($${paramIdx + 1}))`,
        );
        params.push(tagName, values);
        paramIdx += 2;
      }
    }

    const where = conditions.join(" AND ");
    const limitClause =
      filter.limit !== undefined ? `LIMIT ${Math.max(0, filter.limit)}` : "";

    const rows = await rawSql.unsafe<ChangeRow[]>(
      `SELECT c.seq, c.event_id, c.type, c.kind, c.pubkey, c.reason FROM changes c WHERE ${where} ORDER BY c.seq ASC ${limitClause}`,
      toUnsafeQueryParams(params),
    );

    return rows.map((row) => ({
      seq: row.seq,
      eventId: row.event_id,
      type: row.type,
      kind: row.kind,
      pubkey: row.pubkey,
      reason: parseChangeReason(row.reason),
    }));
  }

  async function getMaxSeq(): Promise<number> {
    const rows = await db.select({ val: max(changes.seq) }).from(changes);
    return rows.length > 0 ? (rows[0].val ?? 0) : 0;
  }

  async function getMinSeq(): Promise<number> {
    const rows = await db.select({ val: min(changes.seq) }).from(changes);
    return rows.length > 0 ? (rows[0].val ?? 0) : 0;
  }

  async function getEventCount(): Promise<number> {
    const [row] = await db.select({ val: count() }).from(events);
    return Number(row.val);
  }

  return {
    saveEvent,
    queryEvents,
    deleteEvent,
    processDeletionRequest,
    isEventDeleted,
    queryChanges,
    getMaxSeq,
    getMinSeq,
    getEventCount,
  };
}
