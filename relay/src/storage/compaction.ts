import { and, desc, eq, inArray, lt, min } from "drizzle-orm";

import type { SnapshotRelayDb } from "../db";
import { syncPayloads, syncSnapshots } from "./schema";
import {
  RETAINED_SNAPSHOT_WINDOW_PER_DOCUMENT,
  SNAPSHOT_RETENTION_MODE,
} from "../domain/snapshots/retention";
import { selectNondominatedSnapshotIds } from "../domain/snapshots/vector-clock";

export type CompactionStore = {
  compactPayloadsBefore: (mtime: number) => Promise<number>;
  minRetainedCreatedAt: () => Promise<number | null>;
  retentionInfo: () => Promise<{
    currentSnapshotsFetchable: boolean;
    snapshotRetention: {
      mode: typeof SNAPSHOT_RETENTION_MODE;
      recentCount: number;
      minCreatedAt: number | null;
    };
  }>;
};

export function createCompactionStore(db: SnapshotRelayDb): CompactionStore {
  const minRetainedCreatedAt = async () => {
    const [row] = await db
      .select({ createdAt: min(syncSnapshots.createdAt) })
      .from(syncSnapshots)
      .where(eq(syncSnapshots.payloadRetained, 1));

    return row.createdAt ?? null;
  };

  return {
    async compactPayloadsBefore(mtime) {
      const rows = await db
        .select({
          authorPubkey: syncSnapshots.authorPubkey,
          dTag: syncSnapshots.dTag,
          snapshotId: syncSnapshots.snapshotId,
          eventId: syncSnapshots.eventId,
          mtime: syncSnapshots.mtime,
          vectorClock: syncSnapshots.vectorClock,
          createdAt: syncSnapshots.createdAt,
        })
        .from(syncSnapshots)
        .where(
          and(
            eq(syncSnapshots.payloadRetained, 1),
            lt(syncSnapshots.mtime, mtime),
          ),
        );

      if (rows.length === 0) {
        return 0;
      }

      const latestRetainedRows = await db
        .select({
          authorPubkey: syncSnapshots.authorPubkey,
          dTag: syncSnapshots.dTag,
          snapshotId: syncSnapshots.snapshotId,
          vectorClock: syncSnapshots.vectorClock,
          eventId: syncSnapshots.eventId,
          mtime: syncSnapshots.mtime,
          createdAt: syncSnapshots.createdAt,
        })
        .from(syncSnapshots)
        .where(eq(syncSnapshots.payloadRetained, 1))
        .orderBy(
          syncSnapshots.authorPubkey,
          syncSnapshots.dTag,
          desc(syncSnapshots.mtime),
          desc(syncSnapshots.createdAt),
          desc(syncSnapshots.snapshotId),
        );

      const retainedKeys = new Set<string>();
      const rowsByDocument = new Map<string, typeof latestRetainedRows>();

      for (const row of latestRetainedRows) {
        const documentKey = `${row.authorPubkey}:${row.dTag}`;
        const group = rowsByDocument.get(documentKey);
        if (group) {
          group.push(row);
        } else {
          rowsByDocument.set(documentKey, [row]);
        }
      }

      for (const [documentKey, group] of rowsByDocument) {
        const nondominated = selectNondominatedSnapshotIds(
          group.map((row) => ({
            snapshotId: row.snapshotId,
            vectorClock: row.vectorClock,
          })),
        );

        for (const snapshotId of nondominated) {
          retainedKeys.add(`${documentKey}:${snapshotId}`);
        }

        let retainedCount = nondominated.size;
        for (const row of group) {
          if (retainedKeys.has(`${documentKey}:${row.snapshotId}`)) {
            continue;
          }
          if (retainedCount < RETAINED_SNAPSHOT_WINDOW_PER_DOCUMENT) {
            retainedKeys.add(`${documentKey}:${row.snapshotId}`);
            retainedCount += 1;
          }
        }
      }

      const candidates = rows.filter(
        (row) =>
          !retainedKeys.has(
            `${row.authorPubkey}:${row.dTag}:${row.snapshotId}`,
          ),
      );

      if (candidates.length === 0) {
        return 0;
      }

      const payloadEventIds = candidates
        .map((row) => row.eventId)
        .filter((eventId): eventId is string => typeof eventId === "string");

      await db.transaction(async (tx) => {
        if (payloadEventIds.length > 0) {
          await tx
            .delete(syncPayloads)
            .where(inArray(syncPayloads.eventId, payloadEventIds));
        }

        for (const row of candidates) {
          await tx
            .update(syncSnapshots)
            .set({
              payloadRetained: 0,
              eventId: null,
            })
            .where(
              and(
                eq(syncSnapshots.authorPubkey, row.authorPubkey),
                eq(syncSnapshots.dTag, row.dTag),
                eq(syncSnapshots.snapshotId, row.snapshotId),
              ),
            );
        }
      });

      return candidates.length;
    },
    minRetainedCreatedAt,
    async retentionInfo() {
      const minCreatedAt = await minRetainedCreatedAt();

      return {
        currentSnapshotsFetchable: true,
        snapshotRetention: {
          mode: SNAPSHOT_RETENTION_MODE,
          recentCount: RETAINED_SNAPSHOT_WINDOW_PER_DOCUMENT,
          minCreatedAt,
        },
      };
    },
  };
}
