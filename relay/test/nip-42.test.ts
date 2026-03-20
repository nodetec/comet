import { describe, test, expect } from "bun:test";
import {
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
} from "nostr-tools/pure";
import type { NostrEvent } from "../src/types";
import {
  validateAuthEvent,
  isAuthorizedForFilter,
  isAuthorizedForChangesFilter,
  filterRequiresAuth,
  KIND_AUTH,
} from "../src/relay/nip/42";
import { KIND_GIFT_WRAP } from "../src/relay/nip/59";

const sk = generateSecretKey();
const pubkey = getPublicKey(sk);

const otherSk = generateSecretKey();
const otherPubkey = getPublicKey(otherSk);

const RELAY_URL = "ws://localhost:3000";
const CHALLENGE = "test-challenge-123";

function createAuthEvent(
  key: Uint8Array,
  challenge: string,
  relayUrl: string,
  overrides: Partial<{ kind: number; created_at: number }> = {},
): NostrEvent {
  return finalizeEvent(
    {
      kind: overrides.kind ?? KIND_AUTH,
      content: "",
      tags: [
        ["relay", relayUrl],
        ["challenge", challenge],
      ],
      created_at: overrides.created_at ?? Math.floor(Date.now() / 1000),
    },
    key,
  ) as unknown as NostrEvent;
}

describe("validateAuthEvent", () => {
  test("accepts valid AUTH event", () => {
    const event = createAuthEvent(sk, CHALLENGE, RELAY_URL);
    const result = validateAuthEvent(event, CHALLENGE, RELAY_URL);
    expect(result.ok).toBe(true);
    expect(result.pubkey).toBe(pubkey);
  });

  test("rejects wrong challenge", () => {
    const event = createAuthEvent(sk, "wrong-challenge", RELAY_URL);
    const result = validateAuthEvent(event, CHALLENGE, RELAY_URL);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("challenge");
  });

  test("rejects wrong kind", () => {
    const event = createAuthEvent(sk, CHALLENGE, RELAY_URL, { kind: 1 });
    const result = validateAuthEvent(event, CHALLENGE, RELAY_URL);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("kind 22242");
  });

  test("rejects expired timestamp", () => {
    const event = createAuthEvent(sk, CHALLENGE, RELAY_URL, {
      created_at: Math.floor(Date.now() / 1000) - 700,
    });
    const result = validateAuthEvent(event, CHALLENGE, RELAY_URL);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("timestamp");
  });

  test("rejects missing relay tag", () => {
    const event = finalizeEvent(
      {
        kind: KIND_AUTH,
        content: "",
        tags: [["challenge", CHALLENGE]],
        created_at: Math.floor(Date.now() / 1000),
      },
      sk,
    ) as unknown as NostrEvent;
    const result = validateAuthEvent(event, CHALLENGE, RELAY_URL);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("relay");
  });
});

describe("filterRequiresAuth", () => {
  test("returns true for kind:1059 queries", () => {
    expect(filterRequiresAuth({ kinds: [KIND_GIFT_WRAP] })).toBe(true);
    expect(filterRequiresAuth({ kinds: [1, KIND_GIFT_WRAP] })).toBe(true);
  });

  test("returns false for non-gift-wrap queries", () => {
    expect(filterRequiresAuth({ kinds: [1] })).toBe(false);
    expect(filterRequiresAuth({})).toBe(false);
  });
});

describe("isAuthorizedForFilter", () => {
  test("non-gift-wrap queries are always authorized", () => {
    const result = isAuthorizedForFilter({ kinds: [1] }, new Set());
    expect(result.authorized).toBe(true);
  });

  test("unauthenticated gift wrap query returns auth-required", () => {
    const result = isAuthorizedForFilter(
      { kinds: [KIND_GIFT_WRAP], "#p": [pubkey] },
      new Set(),
    );
    expect(result.authorized).toBe(false);
    expect(result.reason).toContain("auth-required");
  });

  test("authenticated query for own gift wraps succeeds", () => {
    const result = isAuthorizedForFilter(
      { kinds: [KIND_GIFT_WRAP], "#p": [pubkey] },
      new Set([pubkey]),
    );
    expect(result.authorized).toBe(true);
  });

  test("authenticated query for someone else's gift wraps is restricted", () => {
    const result = isAuthorizedForFilter(
      { kinds: [KIND_GIFT_WRAP], "#p": [otherPubkey] },
      new Set([pubkey]),
    );
    expect(result.authorized).toBe(false);
    expect(result.reason).toContain("restricted");
  });

  test("gift wrap query without #p filter is restricted", () => {
    const result = isAuthorizedForFilter(
      { kinds: [KIND_GIFT_WRAP] },
      new Set([pubkey]),
    );
    expect(result.authorized).toBe(false);
    expect(result.reason).toContain("restricted");
  });
});

describe("isAuthorizedForChangesFilter", () => {
  test("non-gift-wrap queries are always authorized", () => {
    const result = isAuthorizedForChangesFilter({ kinds: [1] }, new Set());
    expect(result.authorized).toBe(true);
  });

  test("unauthenticated gift wrap changes returns auth-required", () => {
    const result = isAuthorizedForChangesFilter(
      { kinds: [KIND_GIFT_WRAP], "#p": [pubkey] },
      new Set(),
    );
    expect(result.authorized).toBe(false);
  });

  test("authenticated changes for own gift wraps succeeds", () => {
    const result = isAuthorizedForChangesFilter(
      { kinds: [KIND_GIFT_WRAP], "#p": [pubkey] },
      new Set([pubkey]),
    );
    expect(result.authorized).toBe(true);
  });
});
