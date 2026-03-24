import { describe, expect, test } from "bun:test";

import { parseRevisionEnvelope } from "../../src/domain/revisions/validation";
import { REVISION_SYNC_EVENT_KIND } from "../../src/types";

describe("parseRevisionEnvelope", () => {
  test("parses revision-tagged gift wraps", () => {
    const revisionId =
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const envelope = parseRevisionEnvelope({
      id: "event-1",
      pubkey: "sender-1",
      created_at: 1_700_000_000,
      kind: REVISION_SYNC_EVENT_KIND,
      tags: [
        ["p", "recipient-1"],
        ["d", "doc-1"],
        ["r", revisionId],
        [
          "prev",
          "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        ],
        ["op", "put"],
        ["m", "1700000000000"],
        ["type", "note"],
        ["v", "2"],
      ],
      content: "ciphertext",
      sig: "sig-1",
    });

    expect(envelope).not.toBeNull();
    expect(envelope).toMatchObject({
      recipient: "recipient-1",
      documentId: "doc-1",
      revisionId,
      parentRevisionIds: [
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      ],
      op: "put",
      mtime: 1_700_000_000_000,
      entityType: "note",
      schemaVersion: "2",
    });
  });

  test("rejects missing revision metadata", () => {
    const envelope = parseRevisionEnvelope({
      id: "event-2",
      pubkey: "sender-1",
      created_at: 1_700_000_000,
      kind: REVISION_SYNC_EVENT_KIND,
      tags: [
        ["p", "recipient-1"],
        ["d", "doc-1"],
      ],
      content: "ciphertext",
      sig: "sig-1",
    });

    expect(envelope).toBeNull();
  });
});
