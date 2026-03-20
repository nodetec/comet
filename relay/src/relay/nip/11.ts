export function getRelayInfoDocument(minSeq?: number): object {
  return {
    name: "Comet Relay",
    description: "The private Nostr relay for Comet.",
    pubkey: "",
    contact: "",
    supported_nips: [1, 9, 11, 23, 42, 59, "CF"],
    software: "comet-relay",
    version: "0.1.0",
    changes_feed: {
      min_seq: minSeq ?? 0,
    },
  };
}
