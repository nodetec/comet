import { createServerFn } from "@tanstack/react-start";
import { count, eq, or, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { assertAdmin } from "~/server/middleware";
import {
  blobOwners,
  blobs,
  changes,
  deletedCoords,
  deletedEvents,
  events,
  relayEvents,
  syncChanges,
  syncHeads,
  syncPayloads,
  syncRevisionParents,
  syncRevisions,
  users,
} from "@comet/data";
import { DEFAULT_STORAGE_LIMIT_BYTES } from "~/lib/utils";
import { getAdminErrorMessage } from "~/server/admin/http";

export const listUsers = createServerFn({ method: "GET" }).handler(async () => {
  assertAdmin();
  const [blobStats, eventCounts] = await Promise.all([
    db
      .select({
        pubkey: users.pubkey,
        storageLimitBytes: users.storageLimitBytes,
        storageUsedBytes: sql<number>`COALESCE(SUM(${blobs.size}), 0)`,
        blobCount: sql<number>`COUNT(DISTINCT ${blobOwners.sha256})`,
      })
      .from(users)
      .leftJoin(blobOwners, eq(blobOwners.pubkey, users.pubkey))
      .leftJoin(blobs, eq(blobs.sha256, blobOwners.sha256))
      .groupBy(users.pubkey, users.storageLimitBytes)
      .orderBy(sql`COALESCE(SUM(${blobs.size}), 0) DESC`),
    db.execute<{ user_pubkey: string; event_count: number | string }>(sql`
      WITH event_counts AS (
        SELECT pubkey AS user_pubkey, COUNT(*)::bigint AS event_count
        FROM relay_events
        GROUP BY pubkey
        UNION ALL
        SELECT recipient AS user_pubkey, COUNT(*)::bigint AS event_count
        FROM sync_payloads
        GROUP BY recipient
        UNION ALL
        SELECT COALESCE(recipient, pubkey) AS user_pubkey, COUNT(*)::bigint AS event_count
        FROM events
        GROUP BY COALESCE(recipient, pubkey)
      )
      SELECT user_pubkey, SUM(event_count)::bigint AS event_count
      FROM event_counts
      GROUP BY user_pubkey
    `),
  ]);

  const eventCountMap = new Map<string, number>();
  for (const r of eventCounts) {
    eventCountMap.set(r.user_pubkey, Number(r.event_count));
  }

  return {
    users: blobStats.map((r) => ({
      pubkey: r.pubkey,
      storageUsedBytes: Number(r.storageUsedBytes),
      storageLimitBytes: r.storageLimitBytes,
      blobCount: Number(r.blobCount),
      eventCount: eventCountMap.get(r.pubkey) ?? 0,
    })),
    defaultStorageLimitBytes: DEFAULT_STORAGE_LIMIT_BYTES,
  };
});

export const deleteUserData = createServerFn({ method: "POST" })
  .inputValidator((data: { pubkey: string }) => data)
  .handler(async ({ data }) => {
    assertAdmin();
    if (!data.pubkey || !/^[a-f0-9]{64}$/.test(data.pubkey)) {
      throw new Error("invalid pubkey");
    }

    const blossomUrl = process.env.BLOSSOM_URL;
    const adminToken = process.env.ADMIN_TOKEN;
    if (!blossomUrl || !adminToken) {
      throw new Error("BLOSSOM_URL or ADMIN_TOKEN not configured");
    }

    const blobResponse = await fetch(
      `${blossomUrl}/admin/users/${data.pubkey}/blobs`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${adminToken}` },
      },
    );

    if (!blobResponse.ok) {
      const reason = await getAdminErrorMessage(blobResponse);
      throw new Error(`Blossom user purge failed: ${reason}`);
    }

    const blobSummary = (await blobResponse.json()) as {
      deletedBlobs: number;
      releasedSharedBlobs: number;
      deletedBytes: number;
      processedBlobs: number;
    };

    const eventSummary = await db.transaction(async (tx) => {
      const [[relayEventRow], [revisionPayloadRow], [legacyEventRow]] =
        await Promise.all([
          tx
            .select({ val: count() })
            .from(relayEvents)
            .where(eq(relayEvents.pubkey, data.pubkey)),
          tx
            .select({ val: count() })
            .from(syncPayloads)
            .where(eq(syncPayloads.recipient, data.pubkey)),
          tx
            .select({ val: count() })
            .from(events)
            .where(
              or(
                eq(events.pubkey, data.pubkey),
                eq(events.recipient, data.pubkey),
              ),
            ),
        ]);

      await tx
        .delete(syncChanges)
        .where(eq(syncChanges.recipient, data.pubkey));
      await tx.delete(syncHeads).where(eq(syncHeads.recipient, data.pubkey));
      await tx
        .delete(syncRevisionParents)
        .where(eq(syncRevisionParents.recipient, data.pubkey));
      await tx
        .delete(syncRevisions)
        .where(eq(syncRevisions.recipient, data.pubkey));
      await tx
        .delete(syncPayloads)
        .where(eq(syncPayloads.recipient, data.pubkey));

      await tx.delete(relayEvents).where(eq(relayEvents.pubkey, data.pubkey));

      await tx
        .delete(deletedCoords)
        .where(eq(deletedCoords.pubkey, data.pubkey));
      await tx
        .delete(deletedEvents)
        .where(eq(deletedEvents.pubkey, data.pubkey));
      await tx.delete(changes).where(eq(changes.pubkey, data.pubkey));
      await tx
        .delete(events)
        .where(
          or(eq(events.pubkey, data.pubkey), eq(events.recipient, data.pubkey)),
        );

      return {
        deletedRelayEvents: Number(relayEventRow.val),
        deletedRevisionEvents: Number(revisionPayloadRow.val),
        deletedLegacyEvents: Number(legacyEventRow.val),
      };
    });

    return {
      pubkey: data.pubkey,
      ...blobSummary,
      ...eventSummary,
    };
  });
