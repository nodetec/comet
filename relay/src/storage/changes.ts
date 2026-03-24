import { and, asc, eq, gt, inArray, lte, max } from "drizzle-orm";

import type { RevisionRelayDb } from "../db";
import type { NostrEvent } from "@comet/nostr";

import { syncChanges, syncPayloads } from "./schema";
import type { RevisionChangesFilter } from "../types";

export type StoredChangeEvent = {
  seq: number;
  event: NostrEvent;
};

export type ChangeStore = {
  currentSequence: () => Promise<number>;
  minSequence: () => Promise<number>;
  appendStoredRevisionChange: (input: {
    recipient: string;
    documentId: string;
    revisionId: string;
    eventId: string;
    op: "put" | "del";
    mtime: number;
  }) => Promise<number>;
  queryStoredRevisionEvents: (
    filter: RevisionChangesFilter,
  ) => Promise<StoredChangeEvent[]>;
};

export function createChangeStore(db: RevisionRelayDb): ChangeStore {
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
    async appendStoredRevisionChange(input) {
      const [row] = await db
        .insert(syncChanges)
        .values({
          recipient: input.recipient,
          dTag: input.documentId,
          rev: input.revisionId,
          eventId: input.eventId,
          op: input.op,
          mtime: input.mtime,
        })
        .returning({ seq: syncChanges.seq });

      return row.seq;
    },
    async queryStoredRevisionEvents(filter) {
      const since = filter.since ?? 0;
      const recipientFilter = filter["#p"];
      if (!Array.isArray(recipientFilter) || recipientFilter.length !== 1) {
        throw new Error(
          "revision CHANGES currently requires exactly one #p recipient",
        );
      }

      const conditions = [
        eq(syncChanges.recipient, recipientFilter[0]),
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

      const revFilter = filter["#r"];
      if (Array.isArray(revFilter) && revFilter.length > 0) {
        conditions.push(inArray(syncChanges.rev, revFilter));
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
  };
}
