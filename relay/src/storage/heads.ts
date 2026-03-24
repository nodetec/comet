import { and, asc, eq, inArray, lte } from "drizzle-orm";

import type { RevisionRelayDb } from "../db";
import type { RevisionHead, RevisionScope } from "../types";
import { syncHeads, syncRevisionParents, syncRevisions } from "./schema";

export type HeadStore = {
  listHeads: (scope: RevisionScope) => Promise<RevisionHead[]>;
  listHeadsAtSnapshot: (
    scope: RevisionScope,
    snapshotSeq: number,
  ) => Promise<RevisionHead[]>;
};

export function createHeadStore(db: RevisionRelayDb): HeadStore {
  return {
    async listHeads(scope) {
      const conditions = [eq(syncHeads.recipient, scope.recipient)];
      if (scope.documentIds && scope.documentIds.length > 0) {
        conditions.push(inArray(syncHeads.dTag, scope.documentIds));
      }
      if (scope.revisionIds && scope.revisionIds.length > 0) {
        conditions.push(inArray(syncHeads.rev, scope.revisionIds));
      }

      const rows = await db
        .select({
          recipient: syncHeads.recipient,
          documentId: syncHeads.dTag,
          revisionId: syncHeads.rev,
          op: syncHeads.op,
          mtime: syncHeads.mtime,
        })
        .from(syncHeads)
        .where(and(...conditions))
        .orderBy(asc(syncHeads.dTag), asc(syncHeads.mtime));

      return rows.map((row) => ({
        recipient: row.recipient,
        documentId: row.documentId,
        revisionId: row.revisionId,
        op: row.op,
        mtime: row.mtime,
      }));
    },
    async listHeadsAtSnapshot(scope, snapshotSeq) {
      if (snapshotSeq <= 0) {
        return [];
      }

      const revisionConditions = [
        eq(syncRevisions.recipient, scope.recipient),
        lte(syncRevisions.storedSeq, snapshotSeq),
      ];
      if (scope.documentIds && scope.documentIds.length > 0) {
        revisionConditions.push(inArray(syncRevisions.dTag, scope.documentIds));
      }

      const revisions = await db
        .select({
          recipient: syncRevisions.recipient,
          documentId: syncRevisions.dTag,
          revisionId: syncRevisions.rev,
          op: syncRevisions.op,
          mtime: syncRevisions.mtime,
        })
        .from(syncRevisions)
        .where(and(...revisionConditions))
        .orderBy(asc(syncRevisions.dTag), asc(syncRevisions.mtime));

      if (revisions.length === 0) {
        return [];
      }

      const supersededConditions = [
        eq(syncRevisions.recipient, scope.recipient),
        lte(syncRevisions.storedSeq, snapshotSeq),
      ];
      if (scope.documentIds && scope.documentIds.length > 0) {
        supersededConditions.push(
          inArray(syncRevisions.dTag, scope.documentIds),
        );
      }

      const supersededRows = await db
        .select({
          documentId: syncRevisionParents.dTag,
          parentRevisionId: syncRevisionParents.parentRev,
        })
        .from(syncRevisionParents)
        .innerJoin(
          syncRevisions,
          and(
            eq(syncRevisionParents.recipient, syncRevisions.recipient),
            eq(syncRevisionParents.dTag, syncRevisions.dTag),
            eq(syncRevisionParents.rev, syncRevisions.rev),
          ),
        )
        .where(and(...supersededConditions));

      const superseded = new Set(
        supersededRows.map(
          ({ documentId, parentRevisionId }) =>
            `${documentId}:${parentRevisionId}`,
        ),
      );

      const snapshotHeads = revisions.filter(
        (revision) =>
          !superseded.has(`${revision.documentId}:${revision.revisionId}`),
      );

      if (!scope.revisionIds || scope.revisionIds.length === 0) {
        return snapshotHeads;
      }

      const revisionIdSet = new Set(scope.revisionIds);
      return snapshotHeads.filter((head) => revisionIdSet.has(head.revisionId));
    },
  };
}
