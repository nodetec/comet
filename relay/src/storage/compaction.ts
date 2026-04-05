import { and, desc, eq, inArray, lt, min } from "drizzle-orm";

import type { SnapshotRelayDb } from "../db";
import { syncPayloads, syncSnapshots } from "./schema";

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

      const latestRetainedKeys = new Set<string>();
      const seenDocuments = new Set<string>();
      for (const row of latestRetainedRows) {
        const documentKey = `${row.authorPubkey}:${row.dTag}`;
        if (!seenDocuments.has(documentKey)) {
          seenDocuments.add(documentKey);
          latestRetainedKeys.add(`${documentKey}:${row.snapshotId}`);
        }
      }

      const candidates = rows.filter(
        (row) =>
          !latestRetainedKeys.has(
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
