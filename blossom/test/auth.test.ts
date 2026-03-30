import { describe, expect, test } from "bun:test";
import { finalizeEvent, generateSecretKey } from "nostr-tools/pure";
import {
  KIND_BLOSSOM_AUTH,
  validateBlossomAuth,
  type NostrEvent,
} from "@comet/nostr";

function createAuthHeader(
  overrides: Partial<NostrEvent> = {},
  tags: string[][] = [["t", "upload"]],
): string {
  const secretKey = generateSecretKey();
  const event = finalizeEvent(
    {
      kind: KIND_BLOSSOM_AUTH,
      content: "",
      tags,
      created_at: overrides.created_at ?? Math.floor(Date.now() / 1000),
      ...overrides,
    },
    secretKey,
  );

  return `Nostr ${Buffer.from(JSON.stringify(event)).toString("base64url")}`;
}

describe("validateBlossomAuth", () => {
  test("accepts a valid upload authorization header", () => {
    const result = validateBlossomAuth(createAuthHeader(), "upload");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pubkey).toHaveLength(64);
    }
  });

  test("rejects expired headers", () => {
    const result = validateBlossomAuth(
      createAuthHeader({}, [
        ["t", "upload"],
        ["expiration", "1"],
      ]),
      "upload",
    );

    expect(result).toEqual({
      ok: false,
      reason: "authorization expired",
    });
  });

  test("rejects action mismatches", () => {
    const result = validateBlossomAuth(
      createAuthHeader({}, [["t", "delete"]]),
      "upload",
    );

    expect(result).toEqual({
      ok: false,
      reason: 'invalid action: expected "upload"',
    });
  });

  test("rejects sha mismatches", () => {
    const result = validateBlossomAuth(
      createAuthHeader({}, [
        ["t", "delete"],
        ["x", "a".repeat(64)],
      ]),
      "delete",
      { sha256: "b".repeat(64) },
    );

    expect(result).toEqual({
      ok: false,
      reason: "sha256 mismatch in x tag",
    });
  });

  test("accepts multiple x tags when all required hashes are present", () => {
    const result = validateBlossomAuth(
      createAuthHeader({}, [
        ["t", "upload"],
        ["x", "a".repeat(64)],
        ["x", "b".repeat(64)],
      ]),
      "upload",
      { sha256s: ["a".repeat(64), "b".repeat(64)] },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.hashes).toEqual(["a".repeat(64), "b".repeat(64)]);
    }
  });

  test("rejects when any required batch hash is missing", () => {
    const result = validateBlossomAuth(
      createAuthHeader({}, [
        ["t", "upload"],
        ["x", "a".repeat(64)],
      ]),
      "upload",
      { sha256s: ["a".repeat(64), "b".repeat(64)] },
    );

    expect(result).toEqual({
      ok: false,
      reason: "sha256 mismatch in x tags",
    });
  });
});
