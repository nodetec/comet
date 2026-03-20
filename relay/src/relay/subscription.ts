import type { NostrEvent, Filter } from "../types";
import type { Storage } from "./storage";
import type { ConnectionManager } from "../connections";
import { matchFilters } from "./filter";

const MAX_SUBS_PER_CONNECTION = 20;

type SubscriptionEntry = {
  filters: Filter[];
};

// Per-connection subscription state
const connectionSubs = new Map<string, Map<string, SubscriptionEntry>>();

export async function addSubscription(
  connId: string,
  subId: string,
  filters: Filter[],
  storage: Storage,
  connections: ConnectionManager,
): Promise<void> {
  if (!connectionSubs.has(connId)) {
    connectionSubs.set(connId, new Map());
  }
  const subs = connectionSubs.get(connId)!;

  // Check sub limit (replacing existing sub with same id is allowed)
  if (!subs.has(subId) && subs.size >= MAX_SUBS_PER_CONNECTION) {
    connections.sendJSON(connId, [
      "CLOSED",
      subId,
      "error: too many subscriptions",
    ]);
    return;
  }

  // Store the subscription
  subs.set(subId, { filters });

  // Query historical events
  const events = await storage.queryEvents(filters);
  for (const event of events) {
    connections.sendJSON(connId, ["EVENT", subId, event]);
  }

  // Signal end of stored events
  connections.sendJSON(connId, ["EOSE", subId]);
}

export function removeSubscription(connId: string, subId: string): void {
  const subs = connectionSubs.get(connId);
  if (subs) {
    subs.delete(subId);
    if (subs.size === 0) {
      connectionSubs.delete(connId);
    }
  }
}

export function removeAllSubscriptions(connId: string): void {
  connectionSubs.delete(connId);
}

export function broadcastEvent(
  event: NostrEvent,
  connections: ConnectionManager,
): void {
  // Iterate all connections and their subscriptions
  for (const [connId, subs] of connectionSubs) {
    const conn = connections.get(connId);
    if (!conn) {
      connectionSubs.delete(connId);
      continue;
    }
    for (const [subId, entry] of subs) {
      if (matchFilters(event, entry.filters)) {
        connections.sendJSON(connId, ["EVENT", subId, event]);
      }
    }
  }
}
