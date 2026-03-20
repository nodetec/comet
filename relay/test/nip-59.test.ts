import { describe, test, expect } from "bun:test";
import {
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
} from "nostr-tools/pure";
import type { NostrEvent } from "../src/types";
import {
  validateGiftWrap,
  validateSeal,
  canDeleteGiftWrap,
  KIND_GIFT_WRAP,
  KIND_SEAL,
} from "../src/relay/nip/59";

const sk = generateSecretKey();
getPublicKey(sk);

const recipientSk = generateSecretKey();
const recipientPubkey = getPublicKey(recipientSk);

// Ephemeral key for gift wrapping
const ephemeralSk = generateSecretKey();
getPublicKey(ephemeralSk);

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

function createGiftWrap(
  wrapperKey: Uint8Array,
  recipientPubkey: string,
  encryptedContent = "<encrypted-seal>",
): NostrEvent {
  return sign(wrapperKey, {
    kind: KIND_GIFT_WRAP,
    content: encryptedContent,
    tags: [["p", recipientPubkey]],
  });
}

function createSeal(
  authorKey: Uint8Array,
  encryptedContent = "<encrypted-rumor>",
): NostrEvent {
  return sign(authorKey, {
    kind: KIND_SEAL,
    content: encryptedContent,
    tags: [],
  });
}

// --- Unit tests ---

describe("validateGiftWrap", () => {
  test("accepts valid gift wrap", () => {
    const gw = createGiftWrap(ephemeralSk, recipientPubkey);
    expect(validateGiftWrap(gw)).toBeNull();
  });

  test("rejects gift wrap without p tag", () => {
    const gw = sign(ephemeralSk, {
      kind: KIND_GIFT_WRAP,
      content: "encrypted",
    });
    expect(validateGiftWrap(gw)).toContain("'p' tag");
  });

  test("skips non-gift-wrap events", () => {
    const regular = sign(sk, { kind: 1 });
    expect(validateGiftWrap(regular)).toBeNull();
  });
});

describe("validateSeal", () => {
  test("accepts valid seal", () => {
    const seal = createSeal(sk);
    expect(validateSeal(seal)).toBeNull();
  });

  test("rejects seal with tags", () => {
    const seal = sign(sk, { kind: KIND_SEAL, tags: [["p", recipientPubkey]] });
    expect(validateSeal(seal)).toContain("empty tags");
  });

  test("skips non-seal events", () => {
    const regular = sign(sk, { kind: 1 });
    expect(validateSeal(regular)).toBeNull();
  });
});

describe("canDeleteGiftWrap", () => {
  test("allows recipient to delete", () => {
    const gw = createGiftWrap(ephemeralSk, recipientPubkey);
    expect(canDeleteGiftWrap(gw, recipientPubkey)).toBe(true);
  });

  test("denies non-recipient", () => {
    const gw = createGiftWrap(ephemeralSk, recipientPubkey);
    const otherPubkey = getPublicKey(generateSecretKey());
    expect(canDeleteGiftWrap(gw, otherPubkey)).toBe(false);
  });
});
