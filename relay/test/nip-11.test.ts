import { describe, expect, test } from "bun:test";
import { getRelayInfoDocument } from "../src/relay/nip/11";

describe("NIP-11 relay info", () => {
  test("advertises Comet relay metadata", () => {
    const info = getRelayInfoDocument(42) as {
      name: string;
      description: string;
      software: string;
      supported_nips: Array<number | string>;
      changes_feed: { min_seq: number };
    };

    expect(info.name).toBe("Comet Relay");
    expect(info.description).toBe("The private Nostr relay for Comet.");
    expect(info.software).toBe("comet-relay");
    expect(info.supported_nips).toContain(11);
    expect(info.supported_nips).toContain("CF");
    expect(info.changes_feed.min_seq).toBe(42);
  });
});
