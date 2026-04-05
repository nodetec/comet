import { describe, expect, test } from "bun:test";

import { parseSnapshotEnvelope } from "../../src/domain/snapshots/validation";
import { SNAPSHOT_SYNC_EVENT_KIND } from "../../src/types";

describe("parseSnapshotEnvelope", () => {
  test("parses direct snapshot sync events", () => {
    const envelope = parseSnapshotEnvelope({
      id: "event-1",
      pubkey: "author-1",
      created_at: 1_700_000_000,
      kind: SNAPSHOT_SYNC_EVENT_KIND,
      tags: [
        ["d", "doc-1"],
        ["o", "put"],
        ["c", "notes"],
        ["vc", "DEVICE-A", "1700000000000"],
      ],
      content: "ciphertext",
      sig: "sig-1",
    });

    expect(envelope).not.toBeNull();
    expect(envelope).toMatchObject({
      authorPubkey: "author-1",
      documentCoord: "doc-1",
      op: "put",
      mtime: 1_700_000_000_000,
      entityType: "notes",
    });
  });

  test("rejects missing snapshot metadata", () => {
    const envelope = parseSnapshotEnvelope({
      id: "event-2",
      pubkey: "sender-1",
      created_at: 1_700_000_000,
      kind: SNAPSHOT_SYNC_EVENT_KIND,
      tags: [["d", "doc-1"]],
      content: "ciphertext",
      sig: "sig-1",
    });

    expect(envelope).toBeNull();
  });
});
