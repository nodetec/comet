export type SnapshotRelayInfoDocument = {
  name: string;
  description: string;
  software: string;
  version: string;
  supported_nips: Array<number | string>;
  changes_feed: {
    min_seq: number;
  };
  snapshot_sync: {
    changes_feed: boolean;
    author_scoped: boolean;
    retention: {
      min_payload_mtime: number | null;
    };
  };
};

export function getSnapshotRelayInfoDocument(input: {
  minSeq: number;
  minPayloadMtime: number | null;
}): SnapshotRelayInfoDocument {
  return {
    name: "Relay",
    description:
      "Relay implementation for author-scoped snapshot sync with bootstrap replay and relay-local changes feed.",
    software: "relay",
    version: "0.1.0",
    supported_nips: [11, "CF"],
    changes_feed: {
      min_seq: input.minSeq,
    },
    snapshot_sync: {
      changes_feed: true,
      author_scoped: true,
      retention: {
        min_payload_mtime: input.minPayloadMtime,
      },
    },
  };
}
