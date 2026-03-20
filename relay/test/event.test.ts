import { describe, test, expect } from "bun:test";
import { generateSecretKey, finalizeEvent } from "nostr-tools/pure";
import {
  validateEventStructure,
  validateAndVerifyEvent,
  getEventKindCategory,
} from "../src/relay/event";

function createSignedEvent(
  overrides: Partial<{ kind: number; content: string; tags: string[][] }> = {},
) {
  const sk = generateSecretKey();
  return finalizeEvent(
    {
      kind: overrides.kind ?? 1,
      content: overrides.content ?? "hello",
      tags: overrides.tags ?? [],
      created_at: Math.floor(Date.now() / 1000),
    },
    sk,
  );
}

describe("validateEventStructure", () => {
  test("accepts a valid event", () => {
    const event = createSignedEvent();
    expect(validateEventStructure(event).valid).toBe(true);
  });

  test("rejects non-object", () => {
    expect(validateEventStructure(null).valid).toBe(false);
    expect(validateEventStructure("string").valid).toBe(false);
  });

  test("rejects bad id", () => {
    const event = createSignedEvent();
    (event as any).id = "short";
    expect(validateEventStructure(event).valid).toBe(false);
  });

  test("rejects bad pubkey", () => {
    const event = createSignedEvent();
    (event as any).pubkey = "xyz";
    expect(validateEventStructure(event).valid).toBe(false);
  });

  test("rejects bad sig", () => {
    const event = createSignedEvent();
    (event as any).sig = "bad";
    expect(validateEventStructure(event).valid).toBe(false);
  });

  test("rejects non-integer kind", () => {
    const event = createSignedEvent();
    (event as any).kind = 1.5;
    expect(validateEventStructure(event).valid).toBe(false);
  });

  test("rejects tags with non-string elements", () => {
    const event = createSignedEvent();
    (event as any).tags = [[1, 2]];
    expect(validateEventStructure(event).valid).toBe(false);
  });
});

describe("validateAndVerifyEvent", () => {
  test("accepts a properly signed event", () => {
    const event = createSignedEvent();
    const result = validateAndVerifyEvent(event);
    expect(result.ok).toBe(true);
  });

  test("rejects tampered content", () => {
    const event = createSignedEvent({ content: "original" });
    (event as any).content = "tampered";
    const result = validateAndVerifyEvent(event);
    expect(result.ok).toBe(false);
  });

  test("rejects bad signature", () => {
    const event = createSignedEvent();
    (event as any).sig = "a".repeat(128);
    const result = validateAndVerifyEvent(event);
    expect(result.ok).toBe(false);
  });
});

describe("getEventKindCategory", () => {
  test("regular kinds", () => {
    expect(getEventKindCategory(1)).toBe("regular");
    expect(getEventKindCategory(7)).toBe("regular");
  });

  test("replaceable kinds", () => {
    expect(getEventKindCategory(0)).toBe("replaceable");
    expect(getEventKindCategory(3)).toBe("replaceable");
    expect(getEventKindCategory(10002)).toBe("replaceable");
  });

  test("ephemeral kinds", () => {
    expect(getEventKindCategory(20000)).toBe("ephemeral");
    expect(getEventKindCategory(25000)).toBe("ephemeral");
  });

  test("addressable kinds", () => {
    expect(getEventKindCategory(30000)).toBe("addressable");
    expect(getEventKindCategory(30023)).toBe("addressable");
  });
});
