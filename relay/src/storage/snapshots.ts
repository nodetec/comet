import type { NostrEvent } from "@comet/nostr";

import type { SnapshotRelayDb } from "../db";
import type { RelayFilter, SnapshotEnvelope } from "../types";
import { syncChanges, syncPayloads, syncSnapshots } from "./schema";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";

export type SnapshotStore = {
  insertSnapshot: (
    envelope: SnapshotEnvelope,
  ) => Promise<{ stored: boolean; reason?: string; seq?: number }>;
  querySnapshotEvents: (filters: RelayFilter[]) => Promise<NostrEvent[]>;
  queryCompactedSnapshotIds: (filters: RelayFilter[]) => Promise<string[]>;
};

export function createSnapshotStore(db: SnapshotRelayDb): SnapshotStore {
  return {
    async insertSnapshot(envelope) {
      const existing = await db
        .select({ snapshotId: syncSnapshots.snapshotId })
        .from(syncSnapshots)
        .where(
          and(
            eq(syncSnapshots.authorPubkey, envelope.authorPubkey),
            eq(syncSnapshots.dTag, envelope.documentCoord),
            eq(syncSnapshots.snapshotId, envelope.event.id),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        return {
          stored: false,
          reason: "duplicate: snapshot already exists",
        };
      }

      let storedSeq: number | undefined;
      await db.transaction(async (tx) => {
        await tx.insert(syncPayloads).values({
          eventId: envelope.event.id,
          authorPubkey: envelope.authorPubkey,
          dTag: envelope.documentCoord,
          snapshotId: envelope.event.id,
          pubkey: envelope.event.pubkey,
          kind: envelope.event.kind,
          createdAt: envelope.event.created_at,
          tags: envelope.event.tags,
          content: envelope.event.content,
          sig: envelope.event.sig,
        });

        await tx.insert(syncSnapshots).values({
          authorPubkey: envelope.authorPubkey,
          dTag: envelope.documentCoord,
          snapshotId: envelope.event.id,
          op: envelope.op,
          mtime: envelope.mtime,
          vectorClock: envelope.vectorClock,
          entityType: envelope.entityType,
          eventId: envelope.event.id,
          createdAt: envelope.event.created_at,
        });

        const [change] = await tx
          .insert(syncChanges)
          .values({
            authorPubkey: envelope.authorPubkey,
            dTag: envelope.documentCoord,
            snapshotId: envelope.event.id,
            eventId: envelope.event.id,
            op: envelope.op,
            mtime: envelope.mtime,
          })
          .returning({ seq: syncChanges.seq });
        storedSeq = change.seq;

        await tx
          .update(syncSnapshots)
          .set({ storedSeq: change.seq })
          .where(
            and(
              eq(syncSnapshots.authorPubkey, envelope.authorPubkey),
              eq(syncSnapshots.dTag, envelope.documentCoord),
              eq(syncSnapshots.snapshotId, envelope.event.id),
            ),
          );
      });

      return { stored: true, seq: storedSeq };
    },
    async querySnapshotEvents(filters) {
      if (filters.length === 0) {
        return [];
      }

      const events = new Map<string, NostrEvent>();

      for (const filter of filters) {
        const conditions = [];

        if (filter.ids && filter.ids.length > 0) {
          conditions.push(inArray(syncPayloads.eventId, filter.ids));
        }
        if (filter.authors && filter.authors.length > 0) {
          conditions.push(inArray(syncPayloads.pubkey, filter.authors));
        }
        if (filter.kinds && filter.kinds.length > 0) {
          conditions.push(inArray(syncPayloads.kind, filter.kinds));
        }
        if (filter.since !== undefined) {
          conditions.push(gte(syncPayloads.createdAt, filter.since));
        }
        if (filter.until !== undefined) {
          conditions.push(lte(syncPayloads.createdAt, filter.until));
        }

        const documentValues = asStringArray(filter["#d"]);
        if (documentValues.length > 0) {
          conditions.push(inArray(syncPayloads.dTag, documentValues));
        }

        const query = db
          .select({
            id: syncPayloads.eventId,
            pubkey: syncPayloads.pubkey,
            created_at: syncPayloads.createdAt,
            kind: syncPayloads.kind,
            tags: syncPayloads.tags,
            content: syncPayloads.content,
            sig: syncPayloads.sig,
          })
          .from(syncPayloads)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(asc(syncPayloads.createdAt))
          .limit(
            filter.limit !== undefined ? Math.max(0, filter.limit) : 10_000,
          );

        const rows = await query;
        for (const row of rows) {
          events.set(row.id, {
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

      return Array.from(events.values()).sort((left, right) => {
        if (left.created_at !== right.created_at) {
          return left.created_at - right.created_at;
        }
        return left.id.localeCompare(right.id);
      });
    },
    async queryCompactedSnapshotIds(filters) {
      if (filters.length === 0) {
        return [];
      }

      const snapshotIds = new Set<string>();

      for (const filter of filters) {
        const eventIds = filter.ids;
        if (!Array.isArray(eventIds) || eventIds.length === 0) {
          continue;
        }

        const conditions = [eq(syncSnapshots.payloadRetained, 0)];

        const documentValues = asStringArray(filter["#d"]);
        if (documentValues.length > 0) {
          conditions.push(inArray(syncSnapshots.dTag, documentValues));
        }
        conditions.push(inArray(syncSnapshots.snapshotId, eventIds));

        const rows = await db
          .select({ snapshotId: syncSnapshots.snapshotId })
          .from(syncSnapshots)
          .where(and(...conditions))
          .limit(
            filter.limit !== undefined ? Math.max(0, filter.limit) : 10_000,
          );

        for (const row of rows) {
          snapshotIds.add(row.snapshotId);
        }
      }

      return Array.from(snapshotIds.values()).sort();
    },
  };
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}
