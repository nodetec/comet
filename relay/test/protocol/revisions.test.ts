import { describe, expect, test } from "bun:test";

import { parseRevisionEnvelope } from "../../src/domain/revisions/validation";
import { REVISION_SYNC_EVENT_KIND } from "../../src/types";

describe("parseRevisionEnvelope", () => {
  test("parses direct revision sync events", () => {
    const revisionId =
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const envelope = parseRevisionEnvelope({
      id: "event-1",
      pubkey: "author-1",
      created_at: 1_700_000_000,
      kind: REVISION_SYNC_EVENT_KIND,
      tags: [
        ["d", "doc-1"],
        ["r", revisionId],
        [
          "b",
          "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        ],
        ["o", "put"],
        ["c", "notes"],
      ],
      content: "ciphertext",
      sig: "sig-1",
    });

    expect(envelope).not.toBeNull();
    expect(envelope).toMatchObject({
      authorPubkey: "author-1",
      documentCoord: "doc-1",
      revisionId,
      parentRevisionIds: [
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      ],
      op: "put",
      mtime: 1_700_000_000_000,
      entityType: null,
      schemaVersion: null,
    });
  });

  test("rejects missing revision metadata", () => {
    const envelope = parseRevisionEnvelope({
      id: "event-2",
      pubkey: "sender-1",
      created_at: 1_700_000_000,
      kind: REVISION_SYNC_EVENT_KIND,
      tags: [["d", "doc-1"]],
      content: "ciphertext",
      sig: "sig-1",
    });

    expect(envelope).toBeNull();
  });
});
