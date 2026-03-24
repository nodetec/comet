import { describe, expect, test } from "bun:test";

import { applyRevisionToHeads } from "../../src/domain/revisions/materialize-heads";
import type { RevisionHead } from "../../src/types";

function head(
  revisionId: string,
  mtime: number,
  op: RevisionHead["op"] = "put",
): RevisionHead {
  return {
    recipient: "pubkey-1",
    documentId: "doc-1",
    revisionId,
    op,
    mtime,
  };
}

describe("applyRevisionToHeads", () => {
  test("adds the next head and removes parent heads", () => {
    const heads = applyRevisionToHeads(
      [head("rev-a", 100), head("rev-b", 200)],
      head("rev-c", 300),
      ["rev-a", "rev-b"],
    );

    expect(heads).toEqual([head("rev-c", 300)]);
  });

  test("preserves unrelated heads for conflicts", () => {
    const heads = applyRevisionToHeads(
      [head("rev-a", 100), head("rev-b", 200)],
      head("rev-c", 300),
      ["rev-a"],
    );

    expect(heads).toEqual([head("rev-b", 200), head("rev-c", 300)]);
  });
});
