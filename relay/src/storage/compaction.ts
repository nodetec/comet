import { and, desc, eq, inArray, lt, min } from "drizzle-orm";

import type { SnapshotRelayDb } from "../db";
import { syncChanges, syncPayloads, syncSnapshots } from "./schema";
import {
  MAX_DEL_SNAPSHOTS_PER_AUTHOR,
  RETAINED_SNAPSHOT_WINDOW_PER_DOCUMENT,
  SNAPSHOT_RETENTION_MODE,
} from "../domain/snapshots/retention";
import { selectNondominatedSnapshotIds } from "../domain/snapshots/vector-clock";

export type CompactionStore = {
  compactPayloadsBefore: (mtime: number) => Promise<number>;
  pruneTombstones: () => Promise<number>;
  minRetainedCreatedAt: () => Promise<number | null>;
  retentionInfo: () => Promise<{
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
    async pruneTombstones() {
      // Use vector clocks (not mtime) to determine each document's current
      // state — matching the same logic used by compactPayloadsBefore and
      // bootstrap queries.  A document is "currently deleted" only when
      // every nondominated snapshot is op='del'.  Documents with any
      // nondominated 'put' (live or conflicted) are never pruned.
      const allSnapshots = await db
        .select({
          authorPubkey: syncSnapshots.authorPubkey,
          dTag: syncSnapshots.dTag,
          snapshotId: syncSnapshots.snapshotId,
          op: syncSnapshots.op,
          mtime: syncSnapshots.mtime,
          vectorClock: syncSnapshots.vectorClock,
          eventId: syncSnapshots.eventId,
        })
        .from(syncSnapshots);

      if (allSnapshots.length === 0) {
        return 0;
      }

      // Group by document
      type SnapshotRow = (typeof allSnapshots)[number];
      const rowsByDocument = new Map<string, SnapshotRow[]>();
      for (const row of allSnapshots) {
        const key = `${row.authorPubkey}:${row.dTag}`;
        const group = rowsByDocument.get(key);
        if (group) {
          group.push(row);
        } else {
          rowsByDocument.set(key, [row]);
        }
      }

      // Find documents whose nondominated snapshots are all 'del'
      const currentlyDeleted = new Map<
        string,
        { dTag: string; maxNondominatedMtime: number }[]
      >();

      for (const [, group] of rowsByDocument) {
        const nondominatedIds = selectNondominatedSnapshotIds(
          group.map((row) => ({
            snapshotId: row.snapshotId,
            vectorClock: row.vectorClock,
          })),
        );

        const nondominatedRows = group.filter((row) =>
          nondominatedIds.has(row.snapshotId),
        );

        // If any nondominated snapshot is a 'put', the doc is live/conflicted
        if (nondominatedRows.some((row) => row.op === "put")) {
          continue;
        }

        const authorPubkey = group[0].authorPubkey;
        const dTag = group[0].dTag;
        const maxNondominatedMtime = Math.max(
          ...nondominatedRows.map((row) => row.mtime),
        );

        const docs = currentlyDeleted.get(authorPubkey);
        if (docs) {
          docs.push({ dTag, maxNondominatedMtime });
        } else {
          currentlyDeleted.set(authorPubkey, [{ dTag, maxNondominatedMtime }]);
        }
      }

      let totalPruned = 0;

      for (const [authorPubkey, docs] of currentlyDeleted) {
        if (docs.length <= MAX_DEL_SNAPSHOTS_PER_AUTHOR) {
          continue;
        }

        // Sort newest first by the nondominated mtime, keep the newest,
        // prune the rest.
        docs.sort((a, b) => b.maxNondominatedMtime - a.maxNondominatedMtime);
        const excess = docs.slice(MAX_DEL_SNAPSHOTS_PER_AUTHOR);
        const dTags = excess.map((doc) => doc.dTag);

        await db.transaction(async (tx) => {
          const eventIds = await tx
            .select({ eventId: syncSnapshots.eventId })
            .from(syncSnapshots)
            .where(
              and(
                eq(syncSnapshots.authorPubkey, authorPubkey),
                inArray(syncSnapshots.dTag, dTags),
              ),
            );

          const payloadEventIds = eventIds
            .map((row) => row.eventId)
            .filter(
              (eventId): eventId is string => typeof eventId === "string",
            );

          if (payloadEventIds.length > 0) {
            await tx
              .delete(syncPayloads)
              .where(inArray(syncPayloads.eventId, payloadEventIds));
          }

          await tx
            .delete(syncChanges)
            .where(
              and(
                eq(syncChanges.authorPubkey, authorPubkey),
                inArray(syncChanges.dTag, dTags),
              ),
            );

          await tx
            .delete(syncSnapshots)
            .where(
              and(
                eq(syncSnapshots.authorPubkey, authorPubkey),
                inArray(syncSnapshots.dTag, dTags),
              ),
            );
        });

        totalPruned += dTags.length;
      }

      return totalPruned;
    },
    minRetainedCreatedAt,
    async retentionInfo() {
      const minCreatedAt = await minRetainedCreatedAt();

      return {
        snapshotRetention: {
          mode: SNAPSHOT_RETENTION_MODE,
          recentCount: RETAINED_SNAPSHOT_WINDOW_PER_DOCUMENT,
          minCreatedAt,
        },
      };
    },
  };
}
