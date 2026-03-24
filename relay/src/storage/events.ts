import type { NostrEvent } from "@comet/nostr";
import { eq } from "drizzle-orm";

import type { RevisionRelayDb } from "../db";
import { relayEvents, relayEventTags } from "./schema";

export type GenericEventStore = {
  publish: (event: NostrEvent) => Promise<{ stored: boolean; reason?: string }>;
};

export function createGenericEventStore(
  db: RevisionRelayDb,
): GenericEventStore {
  return {
    async publish(event) {
      const existing = await db
        .select({ id: relayEvents.id })
        .from(relayEvents)
        .where(eq(relayEvents.id, event.id))
        .limit(1);

      if (existing.length > 0) {
        return {
          stored: false,
          reason: "duplicate: event already exists",
        };
      }

      await db.transaction(async (tx) => {
        await tx.insert(relayEvents).values({
          id: event.id,
          pubkey: event.pubkey,
          kind: event.kind,
          createdAt: event.created_at,
          tags: event.tags,
          content: event.content,
          sig: event.sig,
        });

        const tagRows = event.tags
          .filter((tag) => tag.length >= 2)
          .map(([tagName, tagValue]) => ({
            eventId: event.id,
            tagName,
            tagValue,
          }));

        if (tagRows.length > 0) {
          await tx.insert(relayEventTags).values(tagRows);
        }
      });

      return { stored: true };
    },
  };
}
