export type RevisionRelayInfoDocument = {
  name: string;
  description: string;
  software: string;
  version: string;
  supported_nips: Array<number | string>;
  changes_feed: {
    min_seq: number;
  };
  revision_sync: {
    strategy: string;
    current_head_negentropy: boolean;
    changes_feed: boolean;
    recipient_scoped: boolean;
    batch_fetch: boolean;
    retention: {
      min_payload_mtime: number | null;
    };
  };
};

export function getRevisionRelayInfoDocument(input: {
  minSeq: number;
  minPayloadMtime: number | null;
}): RevisionRelayInfoDocument {
  return {
    name: "Relay",
    description:
      "Relay implementation for revision-scoped sync with current-head Negentropy and relay-local changes feed.",
    software: "relay",
    version: "0.1.0",
    supported_nips: [11, "CF", "NEG-REV"],
    changes_feed: {
      min_seq: input.minSeq,
    },
    revision_sync: {
      strategy: "revision-sync.v1",
      current_head_negentropy: true,
      changes_feed: true,
      recipient_scoped: true,
      batch_fetch: true,
      retention: {
        min_payload_mtime: input.minPayloadMtime,
      },
    },
  };
}
