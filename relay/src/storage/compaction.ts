import { and, eq, inArray, lt, min } from "drizzle-orm";

import type { RevisionRelayDb } from "../db";
import { syncHeads, syncPayloads, syncRevisions } from "./schema";

export type CompactionStore = {
  compactPayloadsBefore: (mtime: number) => Promise<number>;
  minPayloadMtime: () => Promise<number | null>;
};

export function createCompactionStore(db: RevisionRelayDb): CompactionStore {
  return {
    async compactPayloadsBefore(mtime) {
      const rows = await db
        .select({
          recipient: syncRevisions.recipient,
          dTag: syncRevisions.dTag,
          rev: syncRevisions.rev,
          payloadEventId: syncRevisions.payloadEventId,
        })
        .from(syncRevisions)
        .where(
          and(
            eq(syncRevisions.payloadRetained, 1),
            lt(syncRevisions.mtime, mtime),
          ),
        );

      if (rows.length === 0) {
        return 0;
      }

      const currentHeads = await db
        .select({
          recipient: syncHeads.recipient,
          dTag: syncHeads.dTag,
          rev: syncHeads.rev,
        })
        .from(syncHeads);

      const headKeys = new Set(
        currentHeads.map(
          (head) => `${head.recipient}:${head.dTag}:${head.rev}`,
        ),
      );

      const candidates = rows.filter(
        (row) => !headKeys.has(`${row.recipient}:${row.dTag}:${row.rev}`),
      );

      if (candidates.length === 0) {
        return 0;
      }

      const payloadEventIds = candidates
        .map((row) => row.payloadEventId)
        .filter((eventId): eventId is string => typeof eventId === "string");

      await db.transaction(async (tx) => {
        if (payloadEventIds.length > 0) {
          await tx
            .delete(syncPayloads)
            .where(inArray(syncPayloads.eventId, payloadEventIds));
        }

        for (const row of candidates) {
          await tx
            .update(syncRevisions)
            .set({
              payloadRetained: 0,
              payloadEventId: null,
            })
            .where(
              and(
                eq(syncRevisions.recipient, row.recipient),
                eq(syncRevisions.dTag, row.dTag),
                eq(syncRevisions.rev, row.rev),
              ),
            );
        }
      });

      return candidates.length;
    },
    async minPayloadMtime() {
      const [row] = await db
        .select({ mtime: min(syncRevisions.mtime) })
        .from(syncRevisions)
        .where(eq(syncRevisions.payloadRetained, 1));

      return row.mtime ?? null;
    },
  };
}
