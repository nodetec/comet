import { describe, test, expect } from "bun:test";
import {
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
} from "nostr-tools/pure";
import type { NostrEvent } from "../src/types";
import {
  validateDeletionEvent,
  getDeletionTargetIds,
  getDeletionTargetAddrs,
  KIND_DELETION,
} from "../src/relay/nip/09";

const sk = generateSecretKey();
const pubkey = getPublicKey(sk);

const sk2 = generateSecretKey();
const pubkey2 = getPublicKey(sk2);

function sign(
  key: Uint8Array,
  overrides: Partial<{
    kind: number;
    content: string;
    tags: string[][];
    created_at: number;
  }> = {},
): NostrEvent {
  return finalizeEvent(
    {
      kind: overrides.kind ?? 1,
      content: overrides.content ?? "",
      tags: overrides.tags ?? [],
      created_at: overrides.created_at ?? Math.floor(Date.now() / 1000),
    },
    key,
  ) as unknown as NostrEvent;
}

function createDeletionEvent(
  key: Uint8Array,
  tags: string[][],
  content = "",
): NostrEvent {
  return sign(key, { kind: KIND_DELETION, tags, content });
}

// --- Unit tests ---

describe("getDeletionTargetIds", () => {
  test("extracts e tags", () => {
    const event = createDeletionEvent(sk, [
      ["e", "aaa"],
      ["e", "bbb"],
      ["k", "1"],
    ]);
    expect(getDeletionTargetIds(event)).toEqual(["aaa", "bbb"]);
  });

  test("returns empty for no e tags", () => {
    const event = createDeletionEvent(sk, [["k", "1"]]);
    expect(getDeletionTargetIds(event)).toEqual([]);
  });
});

describe("getDeletionTargetAddrs", () => {
  test("parses a tags", () => {
    const coord = `30023:${pubkey}:my-article`;
    const event = createDeletionEvent(sk, [["a", coord]]);
    const addrs = getDeletionTargetAddrs(event);
    expect(addrs).toHaveLength(1);
    expect(addrs[0]).toEqual({ kind: 30023, pubkey, dTag: "my-article" });
  });

  test("skips malformed a tags", () => {
    const event = createDeletionEvent(sk, [
      ["a", "invalid"],
      ["a", "30023:short:id"],
    ]);
    expect(getDeletionTargetAddrs(event)).toEqual([]);
  });
});

describe("validateDeletionEvent", () => {
  test("accepts valid deletion with e tags", () => {
    const event = createDeletionEvent(sk, [
      ["e", "a".repeat(64)],
      ["k", "1"],
    ]);
    expect(validateDeletionEvent(event)).toBeNull();
  });

  test("accepts valid deletion with a tags", () => {
    const coord = `30023:${pubkey}:slug`;
    const event = createDeletionEvent(sk, [
      ["a", coord],
      ["k", "30023"],
    ]);
    expect(validateDeletionEvent(event)).toBeNull();
  });

  test("rejects deletion with no targets", () => {
    const event = createDeletionEvent(sk, [["k", "1"]]);
    expect(validateDeletionEvent(event)).toContain("at least one event");
  });

  test("rejects a tag targeting different pubkey", () => {
    const coord = `30023:${pubkey2}:slug`;
    const event = createDeletionEvent(sk, [["a", coord]]);
    expect(validateDeletionEvent(event)).toContain("different author");
  });

  test("skips non-deletion events", () => {
    const event = sign(sk, { kind: 1 });
    expect(validateDeletionEvent(event)).toBeNull();
  });
});
