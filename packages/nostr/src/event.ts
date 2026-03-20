import { getEventHash, validateEvent, verifyEvent } from "nostr-tools/pure";
import type { NostrEvent } from "./types";

type HashableEvent = Parameters<typeof getEventHash>[0];
type VerifiableEvent = Parameters<typeof verifyEvent>[0];
type MutableEvent = NostrEvent & Record<PropertyKey, unknown>;

export type KindCategory =
  | "regular"
  | "replaceable"
  | "ephemeral"
  | "addressable";

export function getEventKindCategory(kind: number): KindCategory {
  if (kind === 0 || kind === 3 || (kind >= 10000 && kind < 20000)) {
    return "replaceable";
  }
  if (kind >= 20000 && kind < 30000) {
    return "ephemeral";
  }
  if (kind >= 30000 && kind < 40000) {
    return "addressable";
  }
  return "regular";
}

export function validateEventStructure(event: unknown): {
  valid: boolean;
  reason?: string;
} {
  if (!event || typeof event !== "object") {
    return { valid: false, reason: "event is not an object" };
  }

  const candidate = event as Record<string, unknown>;

  if (
    typeof candidate.id !== "string" ||
    !/^[a-f0-9]{64}$/.test(candidate.id)
  ) {
    return { valid: false, reason: "invalid: id is not a 64-char hex string" };
  }
  if (
    typeof candidate.pubkey !== "string" ||
    !/^[a-f0-9]{64}$/.test(candidate.pubkey)
  ) {
    return {
      valid: false,
      reason: "invalid: pubkey is not a 64-char hex string",
    };
  }
  if (
    typeof candidate.sig !== "string" ||
    !/^[a-f0-9]{128}$/.test(candidate.sig)
  ) {
    return {
      valid: false,
      reason: "invalid: sig is not a 128-char hex string",
    };
  }
  if (
    typeof candidate.created_at !== "number" ||
    !Number.isInteger(candidate.created_at)
  ) {
    return { valid: false, reason: "invalid: created_at is not an integer" };
  }
  if (
    typeof candidate.kind !== "number" ||
    !Number.isInteger(candidate.kind) ||
    candidate.kind < 0
  ) {
    return {
      valid: false,
      reason: "invalid: kind is not a non-negative integer",
    };
  }
  if (typeof candidate.content !== "string") {
    return { valid: false, reason: "invalid: content is not a string" };
  }
  if (!Array.isArray(candidate.tags)) {
    return { valid: false, reason: "invalid: tags is not an array" };
  }

  for (const tag of candidate.tags as unknown[]) {
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

  const nostrEvent = event as NostrEvent;
  if (!validateEvent(nostrEvent)) {
    return { ok: false, reason: "invalid: event fields failed validation" };
  }

  const expectedId = getEventHash(nostrEvent as HashableEvent);
  if (expectedId !== nostrEvent.id) {
    return { ok: false, reason: "invalid: event id does not match hash" };
  }

  const mutableEvent = nostrEvent as MutableEvent;
  for (const symbol of Object.getOwnPropertySymbols(mutableEvent)) {
    mutableEvent[symbol] = undefined;
  }

  if (!verifyEvent(nostrEvent as VerifiableEvent)) {
    return {
      ok: false,
      reason: "invalid: event signature verification failed",
    };
  }

  return { ok: true, reason: "" };
}
