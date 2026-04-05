import { and, asc, eq, gt, inArray, lte, max } from "drizzle-orm";

import type { SnapshotRelayDb } from "../db";
import type { NostrEvent } from "@comet/nostr";

import { syncChanges, syncPayloads, syncSnapshots } from "./schema";
import type { SnapshotChangesFilter } from "../types";
import { selectNondominatedSnapshotIds } from "../domain/snapshots/vector-clock";

export type StoredChangeEvent = {
  seq: number;
  event: NostrEvent;
};

export type ChangeStore = {
  currentSequence: () => Promise<number>;
  minSequence: () => Promise<number>;
  appendStoredSnapshotChange: (input: {
    authorPubkey: string;
    documentCoord: string;
    eventId: string;
    op: "put" | "del";
    mtime: number;
  }) => Promise<number>;
  queryStoredSnapshotEvents: (
    filter: SnapshotChangesFilter,
  ) => Promise<StoredChangeEvent[]>;
  queryBootstrapSnapshotEvents: (
    filter: SnapshotChangesFilter,
  ) => Promise<NostrEvent[]>;
};

export function createChangeStore(db: SnapshotRelayDb): ChangeStore {
  return {
    async currentSequence() {
      const [row] = await db
        .select({ seq: max(syncChanges.seq) })
        .from(syncChanges);
      return row.seq ?? 0;
    },
    async minSequence() {
      const rows = await db.execute<{ seq: number | string | null }>(
        'SELECT COALESCE(MIN(seq), 0) AS "seq" FROM sync_changes',
      );
      const row = rows[0];
      return row.seq === null ? 0 : Number(row.seq);
    },
    async appendStoredSnapshotChange(input) {
      const [row] = await db
        .insert(syncChanges)
        .values({
          authorPubkey: input.authorPubkey,
          dTag: input.documentCoord,
          snapshotId: input.eventId,
          eventId: input.eventId,
          op: input.op,
          mtime: input.mtime,
        })
        .returning({ seq: syncChanges.seq });

      return row.seq;
    },
    async queryStoredSnapshotEvents(filter) {
      const since = filter.since ?? 0;
      const authorFilter = filter.authors;
      if (!Array.isArray(authorFilter) || authorFilter.length !== 1) {
        throw new Error(
          "snapshot CHANGES currently requires exactly one author",
        );
      }

      const conditions = [
        eq(syncChanges.authorPubkey, authorFilter[0]),
        gt(syncChanges.seq, since),
      ];

      if (filter.until_seq !== undefined) {
        conditions.push(lte(syncChanges.seq, filter.until_seq));
      }

      if (Array.isArray(filter.kinds) && filter.kinds.length > 0) {
        conditions.push(inArray(syncPayloads.kind, filter.kinds));
      }

      if (Array.isArray(filter.authors) && filter.authors.length > 0) {
        conditions.push(inArray(syncPayloads.pubkey, filter.authors));
      }

      const documentFilter = filter["#d"];
      if (Array.isArray(documentFilter) && documentFilter.length > 0) {
        conditions.push(inArray(syncChanges.dTag, documentFilter));
      }

      const rows = await db
        .select({
          seq: syncChanges.seq,
          id: syncPayloads.eventId,
          pubkey: syncPayloads.pubkey,
          created_at: syncPayloads.createdAt,
          kind: syncPayloads.kind,
          tags: syncPayloads.tags,
          content: syncPayloads.content,
          sig: syncPayloads.sig,
        })
        .from(syncChanges)
        .innerJoin(syncPayloads, eq(syncChanges.eventId, syncPayloads.eventId))
        .where(and(...conditions))
        .orderBy(asc(syncChanges.seq))
        .limit(filter.limit !== undefined ? Math.max(0, filter.limit) : 10_000);

      return rows.map((row) => ({
        seq: row.seq,
        event: {
          id: row.id,
          pubkey: row.pubkey,
          created_at: row.created_at,
          kind: row.kind,
          tags: row.tags,
          content: row.content,
          sig: row.sig,
        },
      }));
    },
    async queryBootstrapSnapshotEvents(filter) {
      const authorFilter = filter.authors;
      if (!Array.isArray(authorFilter) || authorFilter.length !== 1) {
        throw new Error(
          "snapshot CHANGES currently requires exactly one author",
        );
      }

      const conditions = [
        eq(syncSnapshots.authorPubkey, authorFilter[0]),
        eq(syncSnapshots.payloadRetained, 1),
      ];

      const documentFilter = filter["#d"];
      if (Array.isArray(documentFilter) && documentFilter.length > 0) {
        conditions.push(inArray(syncSnapshots.dTag, documentFilter));
      }

      const rows = await db
        .select({
          authorPubkey: syncSnapshots.authorPubkey,
          dTag: syncSnapshots.dTag,
          snapshotId: syncSnapshots.snapshotId,
          vectorClock: syncSnapshots.vectorClock,
          id: syncPayloads.eventId,
          pubkey: syncPayloads.pubkey,
          created_at: syncPayloads.createdAt,
          kind: syncPayloads.kind,
          tags: syncPayloads.tags,
          content: syncPayloads.content,
          sig: syncPayloads.sig,
        })
        .from(syncSnapshots)
        .innerJoin(
          syncPayloads,
          eq(syncSnapshots.eventId, syncPayloads.eventId),
        )
        .where(and(...conditions))
        .orderBy(asc(syncPayloads.createdAt))
        .limit(filter.limit !== undefined ? Math.max(0, filter.limit) : 10_000);

      const rowsByDocument = new Map<string, typeof rows>();
      for (const row of rows) {
        const key = `${row.authorPubkey}:${row.dTag}`;
        const group = rowsByDocument.get(key);
        if (group) {
          group.push(row);
        } else {
          rowsByDocument.set(key, [row]);
        }
      }

      const events: NostrEvent[] = [];
      for (const group of rowsByDocument.values()) {
        const nondominated = selectNondominatedSnapshotIds(
          group.map((row) => ({
            snapshotId: row.snapshotId,
            vectorClock: row.vectorClock,
          })),
        );
        for (const row of group) {
          if (!nondominated.has(row.snapshotId)) {
            continue;
          }
          events.push({
            id: row.id,
            pubkey: row.pubkey,
            created_at: row.created_at,
            kind: row.kind,
            tags: row.tags,
            content: row.content,
            sig: row.sig,
          });
        }
      }

      return events.sort((left, right) => {
        if (left.created_at !== right.created_at) {
          return left.created_at - right.created_at;
        }
        return left.id.localeCompare(right.id);
      });
    },
  };
}
