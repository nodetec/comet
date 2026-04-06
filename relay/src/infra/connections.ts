import type { NostrEvent } from "@comet/nostr";

import type { SnapshotChangesFilter } from "../types";

type LiveSocket = {
  send(data: string): unknown;
};

export type ConnectionRecord = {
  id: string;
  challenge: string;
  socket: LiveSocket;
  accessKey: string | null;
  authedPubkeys: Set<string>;
  liveChangesSubscriptions: Map<string, SnapshotChangesFilter>;
};

export type ConnectionRegistry = ReturnType<typeof createConnectionRegistry>;

export function createConnectionRegistry() {
  const connections = new Map<string, ConnectionRecord>();

  return {
    register(id: string, socket: LiveSocket, challenge: string) {
      const record = {
        id,
        challenge,
        socket,
        accessKey: null as string | null,
        authedPubkeys: new Set<string>(),
        liveChangesSubscriptions: new Map<string, SnapshotChangesFilter>(),
      };
      connections.set(id, record);
      return record;
    },
    remove(id: string) {
      connections.delete(id);
    },
    getChallenge(id: string) {
      return connections.get(id)?.challenge ?? "";
    },
    getAuthedPubkeys(id: string) {
      return connections.get(id)?.authedPubkeys ?? new Set<string>();
    },
    setAccessKey(id: string, key: string) {
      const record = connections.get(id);
      if (!record) {
        return;
      }
      record.accessKey = key;
    },
    getAccessKey(id: string) {
      return connections.get(id)?.accessKey ?? null;
    },
    addAuthedPubkey(id: string, pubkey: string) {
      const record = connections.get(id);
      if (!record) {
        return;
      }
      record.authedPubkeys.add(pubkey);
    },
    addLiveChangesSubscription(
      id: string,
      subscriptionId: string,
      filter: SnapshotChangesFilter,
    ) {
      const record = connections.get(id);
      if (!record) {
        return;
      }
      record.liveChangesSubscriptions.set(subscriptionId, filter);
    },
    removeLiveChangesSubscription(id: string, subscriptionId: string) {
      const record = connections.get(id);
      if (!record) {
        return;
      }
      record.liveChangesSubscriptions.delete(subscriptionId);
    },
    broadcastRevisionChange(input: {
      seq: number;
      event: NostrEvent;
      authorPubkey: string;
      documentCoord: string;
    }) {
      for (const record of connections.values()) {
        for (const [
          subscriptionId,
          filter,
        ] of record.liveChangesSubscriptions) {
          if (!matchesLiveChangesFilter(filter, input)) {
            continue;
          }

          record.socket.send(
            JSON.stringify([
              "CHANGES",
              subscriptionId,
              "EVENT",
              input.seq,
              input.event,
            ]),
          );
        }
      }
    },
    size() {
      return connections.size;
    },
    entries() {
      return connections.entries();
    },
  };
}

function matchesLiveChangesFilter(
  filter: SnapshotChangesFilter,
  input: {
    seq: number;
    event: NostrEvent;
    authorPubkey: string;
    documentCoord: string;
  },
) {
  if (filter.since !== undefined && input.seq <= filter.since) {
    return false;
  }

  if (
    Array.isArray(filter.authors) &&
    filter.authors.length > 0 &&
    !filter.authors.includes(input.authorPubkey)
  ) {
    return false;
  }

  const documentFilter = asStringArray(filter["#d"]);
  if (
    documentFilter.length > 0 &&
    !documentFilter.includes(input.documentCoord)
  ) {
    return false;
  }

  if (
    Array.isArray(filter.kinds) &&
    filter.kinds.length > 0 &&
    !filter.kinds.includes(input.event.kind)
  ) {
    return false;
  }

  if (
    Array.isArray(filter.authors) &&
    filter.authors.length > 0 &&
    !filter.authors.includes(input.event.pubkey)
  ) {
    return false;
  }

  return true;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}
