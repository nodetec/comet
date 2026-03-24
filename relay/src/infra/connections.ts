import type { NostrEvent } from "@comet/nostr";

import type { RevisionChangesFilter } from "../types";

type LiveSocket = {
  send(data: string): unknown;
};

export type ConnectionRecord = {
  id: string;
  challenge: string;
  socket: LiveSocket;
  authedPubkeys: Set<string>;
  liveChangesSubscriptions: Map<string, RevisionChangesFilter>;
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
        authedPubkeys: new Set<string>(),
        liveChangesSubscriptions: new Map<string, RevisionChangesFilter>(),
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
      filter: RevisionChangesFilter,
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
      recipient: string;
      documentId: string;
      revisionId: string;
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
  filter: RevisionChangesFilter,
  input: {
    seq: number;
    event: NostrEvent;
    recipient: string;
    documentId: string;
    revisionId: string;
  },
) {
  if (filter.since !== undefined && input.seq <= filter.since) {
    return false;
  }

  const recipientFilter = asStringArray(filter["#p"]);
  if (
    recipientFilter.length > 0 &&
    !recipientFilter.includes(input.recipient)
  ) {
    return false;
  }

  const documentFilter = asStringArray(filter["#d"]);
  if (documentFilter.length > 0 && !documentFilter.includes(input.documentId)) {
    return false;
  }

  const revisionFilter = asStringArray(filter["#r"]);
  if (revisionFilter.length > 0 && !revisionFilter.includes(input.revisionId)) {
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
