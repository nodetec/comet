import { verifyEvent, validateEvent, getEventHash } from "nostr-tools/pure";
import type { NostrEvent } from "../types";

type HashableEvent = Parameters<typeof getEventHash>[0];
type VerifiableEvent = Parameters<typeof verifyEvent>[0];
type MutableEvent = NostrEvent & Record<PropertyKey, unknown>;

export type KindCategory =
  | "regular"
  | "replaceable"
  | "ephemeral"
  | "addressable";

export function getEventKindCategory(kind: number): KindCategory {
  if (kind === 0 || kind === 3 || (kind >= 10000 && kind < 20000))
    return "replaceable";
  if (kind >= 20000 && kind < 30000) return "ephemeral";
  if (kind >= 30000 && kind < 40000) return "addressable";
  return "regular";
}

export function validateEventStructure(event: unknown): {
  valid: boolean;
  reason?: string;
} {
  if (!event || typeof event !== "object") {
    return { valid: false, reason: "event is not an object" };
  }

  const e = event as Record<string, unknown>;

  if (typeof e.id !== "string" || !/^[a-f0-9]{64}$/.test(e.id)) {
    return { valid: false, reason: "invalid: id is not a 64-char hex string" };
  }
  if (typeof e.pubkey !== "string" || !/^[a-f0-9]{64}$/.test(e.pubkey)) {
    return {
      valid: false,
      reason: "invalid: pubkey is not a 64-char hex string",
    };
  }
  if (typeof e.sig !== "string" || !/^[a-f0-9]{128}$/.test(e.sig)) {
    return {
      valid: false,
      reason: "invalid: sig is not a 128-char hex string",
    };
  }
  if (typeof e.created_at !== "number" || !Number.isInteger(e.created_at)) {
    return { valid: false, reason: "invalid: created_at is not an integer" };
  }
  if (typeof e.kind !== "number" || !Number.isInteger(e.kind) || e.kind < 0) {
    return {
      valid: false,
      reason: "invalid: kind is not a non-negative integer",
    };
  }
  if (typeof e.content !== "string") {
    return { valid: false, reason: "invalid: content is not a string" };
  }
  if (!Array.isArray(e.tags)) {
    return { valid: false, reason: "invalid: tags is not an array" };
  }
  for (const tag of e.tags as unknown[]) {
    if (!Array.isArray(tag)) {
      return { valid: false, reason: "invalid: tag is not an array" };
    }
    for (const item of tag) {
      if (typeof item !== "string") {
        return { valid: false, reason: "invalid: tag element is not a string" };
      }
    }
  }

  return { valid: true };
}

export function validateAndVerifyEvent(event: unknown): {
  ok: boolean;
  reason: string;
} {
  const structural = validateEventStructure(event);
  if (!structural.valid) {
    return { ok: false, reason: structural.reason! };
  }

  const e = event as NostrEvent;

  if (!validateEvent(e)) {
    return { ok: false, reason: "invalid: event fields failed validation" };
  }

  // Verify ID matches the serialized event hash
  const expectedId = getEventHash(e as HashableEvent);
  if (expectedId !== e.id) {
    return { ok: false, reason: "invalid: event id does not match hash" };
  }

  // Clear any cached verification so we always verify the signature fresh
  const mutableEvent = e as MutableEvent;
  for (const sym of Object.getOwnPropertySymbols(mutableEvent)) {
    mutableEvent[sym] = undefined;
  }

  if (!verifyEvent(e as VerifiableEvent)) {
    return {
      ok: false,
      reason: "invalid: event signature verification failed",
    };
  }

  return { ok: true, reason: "" };
}
