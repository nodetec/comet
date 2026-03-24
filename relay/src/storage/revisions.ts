import type { NostrEvent } from "@comet/nostr";

import type { RevisionRelayDb } from "../db";
import type { RelayFilter, RevisionEnvelope } from "../types";
import {
  syncChanges,
  syncChangeTags,
  syncHeads,
  syncPayloads,
  syncRevisionParents,
  syncRevisions,
} from "./schema";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";

export type RevisionStore = {
  insertRevision: (
    envelope: RevisionEnvelope,
  ) => Promise<{ stored: boolean; reason?: string; seq?: number }>;
  queryRevisionEvents: (filters: RelayFilter[]) => Promise<NostrEvent[]>;
  queryCompactedRevisionIds: (filters: RelayFilter[]) => Promise<string[]>;
};

export function createRevisionStore(db: RevisionRelayDb): RevisionStore {
  return {
    async insertRevision(envelope) {
      const existing = await db
        .select({ rev: syncRevisions.rev })
        .from(syncRevisions)
        .where(
          and(
            eq(syncRevisions.recipient, envelope.recipient),
            eq(syncRevisions.dTag, envelope.documentId),
            eq(syncRevisions.rev, envelope.revisionId),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        return {
          stored: false,
          reason: "duplicate: revision already exists",
        };
      }

      let storedSeq: number | undefined;
      await db.transaction(async (tx) => {
        await tx.insert(syncPayloads).values({
          eventId: envelope.event.id,
          recipient: envelope.recipient,
          dTag: envelope.documentId,
          rev: envelope.revisionId,
          pubkey: envelope.event.pubkey,
          kind: envelope.event.kind,
          createdAt: envelope.event.created_at,
          tags: envelope.event.tags,
          content: envelope.event.content,
          sig: envelope.event.sig,
        });

        await tx.insert(syncRevisions).values({
          recipient: envelope.recipient,
          dTag: envelope.documentId,
          rev: envelope.revisionId,
          op: envelope.op,
          mtime: envelope.mtime,
          entityType: envelope.entityType,
          payloadEventId: envelope.event.id,
          createdAt: envelope.event.created_at,
        });

        if (envelope.parentRevisionIds.length > 0) {
          await tx.insert(syncRevisionParents).values(
            envelope.parentRevisionIds.map((parentRev) => ({
              recipient: envelope.recipient,
              dTag: envelope.documentId,
              rev: envelope.revisionId,
              parentRev,
            })),
          );

          await tx
            .delete(syncHeads)
            .where(
              and(
                eq(syncHeads.recipient, envelope.recipient),
                eq(syncHeads.dTag, envelope.documentId),
                inArray(syncHeads.rev, envelope.parentRevisionIds),
              ),
            );
        }

        await tx.insert(syncHeads).values({
          recipient: envelope.recipient,
          dTag: envelope.documentId,
          rev: envelope.revisionId,
          op: envelope.op,
          mtime: envelope.mtime,
        });

        const [change] = await tx
          .insert(syncChanges)
          .values({
            recipient: envelope.recipient,
            dTag: envelope.documentId,
            rev: envelope.revisionId,
            eventId: envelope.event.id,
            op: envelope.op,
            mtime: envelope.mtime,
          })
          .returning({ seq: syncChanges.seq });
        storedSeq = change.seq;

        const changeTags = envelope.event.tags
          .filter((tag) => tag.length >= 2)
          .map(([tagName, tagValue]) => ({
            seq: change.seq,
            tagName,
            tagValue,
          }));

        if (changeTags.length > 0) {
          await tx.insert(syncChangeTags).values(changeTags);
        }

        await tx
          .update(syncRevisions)
          .set({ storedSeq: change.seq })
          .where(
            and(
              eq(syncRevisions.recipient, envelope.recipient),
              eq(syncRevisions.dTag, envelope.documentId),
              eq(syncRevisions.rev, envelope.revisionId),
            ),
          );
      });

      return { stored: true, seq: storedSeq };
    },
    async queryRevisionEvents(filters) {
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

        const recipientValues = asStringArray(filter["#p"]);
        if (recipientValues.length > 0) {
          conditions.push(inArray(syncPayloads.recipient, recipientValues));
        }

        const documentValues = asStringArray(filter["#d"]);
        if (documentValues.length > 0) {
          conditions.push(inArray(syncPayloads.dTag, documentValues));
        }

        const revisionValues = asStringArray(filter["#r"]);
        if (revisionValues.length > 0) {
          conditions.push(inArray(syncPayloads.rev, revisionValues));
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
    async queryCompactedRevisionIds(filters) {
      if (filters.length === 0) {
        return [];
      }

      const revisions = new Set<string>();

      for (const filter of filters) {
        const revisionValues = asStringArray(filter["#r"]);
        if (revisionValues.length === 0) {
          continue;
        }

        const conditions = [eq(syncRevisions.payloadRetained, 0)];

        const recipientValues = asStringArray(filter["#p"]);
        if (recipientValues.length > 0) {
          conditions.push(inArray(syncRevisions.recipient, recipientValues));
        }

        const documentValues = asStringArray(filter["#d"]);
        if (documentValues.length > 0) {
          conditions.push(inArray(syncRevisions.dTag, documentValues));
        }

        conditions.push(inArray(syncRevisions.rev, revisionValues));

        const rows = await db
          .select({ rev: syncRevisions.rev })
          .from(syncRevisions)
          .where(and(...conditions))
          .limit(
            filter.limit !== undefined ? Math.max(0, filter.limit) : 10_000,
          );

        for (const row of rows) {
          revisions.add(row.rev);
        }
      }

      return Array.from(revisions.values()).sort();
    },
  };
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}
