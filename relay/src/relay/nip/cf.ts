import type { NostrEvent, ChangesFilter, ChangeEntry } from "../../types";
import type { Storage } from "../storage";
import type { ConnectionManager } from "../../connections";

const MAX_CHANGES_SUBS_PER_CONNECTION = 10;

type ChangesSubscription = {
  filter: ChangesFilter;
  live: boolean;
};

// Per-connection changes subscription state
const changesSubs = new Map<string, Map<string, ChangesSubscription>>();

export function isValidChangesFilter(f: unknown): f is ChangesFilter {
  if (!f || typeof f !== "object") return false;
  const filter = f as Record<string, unknown>;
  for (const [key, value] of Object.entries(filter)) {
    switch (key) {
      case "since":
      case "until_seq":
      case "limit":
        if (typeof value !== "number") return false;
        break;
      case "kinds":
      case "authors":
        if (!Array.isArray(value)) return false;
        break;
      case "live":
        if (typeof value !== "boolean") return false;
        break;
      default:
        if (key[0] === "#") {
          if (!Array.isArray(value)) return false;
        }
        break;
    }
  }
  return true;
}

export async function handleChangesRequest(
  connId: string,
  subId: string,
  filter: ChangesFilter,
  storage: Storage,
  connections: ConnectionManager,
): Promise<void> {
  if (!changesSubs.has(connId)) {
    changesSubs.set(connId, new Map());
  }
  const subs = changesSubs.get(connId)!;

  if (!subs.has(subId) && subs.size >= MAX_CHANGES_SUBS_PER_CONNECTION) {
    connections.sendJSON(connId, [
      "CHANGES",
      subId,
      "ERR",
      "too many subscriptions",
    ]);
    return;
  }

  // Check if checkpoint is too old
  const minSeq = await storage.getMinSeq();
  const since = filter.since ?? 0;
  if (minSeq > 0 && since > 0 && since < minSeq) {
    connections.sendJSON(connId, [
      "CHANGES",
      subId,
      "ERR",
      `checkpoint too old: min_seq is ${minSeq}`,
    ]);
    return;
  }

  // Store subscription (for live mode)
  const isLive = filter.live === true;
  subs.set(subId, { filter, live: isLive });

  // Query historical changes and batch-fetch events for STORED entries
  const changes = await storage.queryChanges(filter);
  const storedIds = changes
    .filter((c) => c.type === "STORED")
    .map((c) => c.eventId);
  const eventsMap = new Map<string, NostrEvent>();
  if (storedIds.length > 0) {
    const events = await storage.queryEvents([{ ids: storedIds }]);
    for (const event of events) {
      eventsMap.set(event.id, event);
    }
  }
  for (const change of changes) {
    if (change.type === "STORED") {
      const event = eventsMap.get(change.eventId);
      if (event) {
        connections.sendJSON(connId, [
          "CHANGES",
          subId,
          "EVENT",
          change.seq,
          event,
        ]);
      }
    } else {
      connections.sendJSON(connId, [
        "CHANGES",
        subId,
        "DELETED",
        change.seq,
        change.eventId,
        change.reason ?? {},
      ]);
    }
  }

  // Send EOSE with the global max seq
  const maxSeq = await storage.getMaxSeq();
  connections.sendJSON(connId, ["CHANGES", subId, "EOSE", maxSeq]);

  // If not live, remove the subscription after EOSE
  if (!isLive) {
    subs.delete(subId);
    if (subs.size === 0) {
      changesSubs.delete(connId);
    }
  }
}

/** Check if a change entry matches a changes filter (for live broadcasting). */
function matchChangesFilter(
  change: ChangeEntry,
  filter: ChangesFilter,
): boolean {
  if (filter.kinds && !filter.kinds.includes(change.kind)) return false;
  if (filter.authors && !filter.authors.includes(change.pubkey)) return false;

  // Tag filters — check against denormalized tags on the change entry
  for (const key of Object.keys(filter)) {
    if (key[0] === "#") {
      const tagName = key.slice(1);
      const values = filter[key as `#${string}`];
      if (!Array.isArray(values) || values.length === 0) continue;
      const tags = change.tags ?? [];
      const match = tags.some(([t, v]) => t === tagName && values.includes(v));
      if (!match) return false;
    }
  }

  return true;
}

/**
 * Broadcast new changelog entries to live CHANGES subscribers.
 * Pass `event` when available (from handleEvent) to avoid a DB round-trip for STORED entries.
 */
export async function broadcastChanges(
  changes: ChangeEntry[],
  storage: Storage,
  connections: ConnectionManager,
  event?: NostrEvent,
): Promise<void> {
  if (changes.length === 0) return;

  // Build a lookup for STORED events — use the passed event if available, else fetch
  const eventsMap = new Map<string, NostrEvent>();
  if (event) {
    eventsMap.set(event.id, event);
  }

  for (const [connId, subs] of changesSubs) {
    const conn = connections.get(connId);
    if (!conn) {
      changesSubs.delete(connId);
      continue;
    }
    for (const [subId, sub] of subs) {
      if (!sub.live) continue;
      for (const change of changes) {
        if (!matchChangesFilter(change, sub.filter)) continue;
        if (change.type === "STORED") {
          let ev = eventsMap.get(change.eventId);
          if (!ev) {
            const fetched = await storage.queryEvents([
              { ids: [change.eventId] },
            ]);
            if (fetched.length > 0) {
              ev = fetched[0];
              eventsMap.set(ev.id, ev);
            }
          }
          if (ev) {
            connections.sendJSON(connId, [
              "CHANGES",
              subId,
              "EVENT",
              change.seq,
              ev,
            ]);
          }
        } else {
          connections.sendJSON(connId, [
            "CHANGES",
            subId,
            "DELETED",
            change.seq,
            change.eventId,
            change.reason ?? {},
          ]);
        }
      }
    }
  }
}

export function removeChangesSubscription(connId: string, subId: string): void {
  const subs = changesSubs.get(connId);
  if (subs) {
    subs.delete(subId);
    if (subs.size === 0) {
      changesSubs.delete(connId);
    }
  }
}

export function removeAllChangesSubscriptions(connId: string): void {
  changesSubs.delete(connId);
}
