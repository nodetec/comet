import { and, desc, eq, inArray, lt, min } from "drizzle-orm";

import type { SnapshotRelayDb } from "../db";
import { syncPayloads, syncSnapshots } from "./schema";

const RETAINED_SNAPSHOT_WINDOW_PER_DOCUMENT = 4;

export type CompactionStore = {
  compactPayloadsBefore: (mtime: number) => Promise<number>;
  minPayloadMtime: () => Promise<number | null>;
};

export function createCompactionStore(db: SnapshotRelayDb): CompactionStore {
  return {
    async compactPayloadsBefore(mtime) {
      const rows = await db
        .select({
          authorPubkey: syncSnapshots.authorPubkey,
          dTag: syncSnapshots.dTag,
          snapshotId: syncSnapshots.snapshotId,
          eventId: syncSnapshots.eventId,
          mtime: syncSnapshots.mtime,
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
      const retainedCounts = new Map<string, number>();
      for (const row of latestRetainedRows) {
        const documentKey = `${row.authorPubkey}:${row.dTag}`;
        const retainedCount = retainedCounts.get(documentKey) ?? 0;
        if (retainedCount < RETAINED_SNAPSHOT_WINDOW_PER_DOCUMENT) {
          retainedCounts.set(documentKey, retainedCount + 1);
          retainedKeys.add(`${documentKey}:${row.snapshotId}`);
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
    async minPayloadMtime() {
      const [row] = await db
        .select({ mtime: min(syncSnapshots.mtime) })
        .from(syncSnapshots)
        .where(eq(syncSnapshots.payloadRetained, 1));

      return row.mtime ?? null;
    },
  };
}
