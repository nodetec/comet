import type { NostrEvent, Filter, ChangesFilter } from "../../types";
import { validateAndVerifyEvent } from "../event";
import { KIND_GIFT_WRAP } from "./59";

export const KIND_AUTH = 22242;

const AUTH_WINDOW_SECONDS = 600; // 10 minutes

/**
 * Validate and process an AUTH event.
 * Returns { ok, pubkey, reason }.
 */
export function validateAuthEvent(
  event: unknown,
  challenge: string,
  _relayUrl: string,
): { ok: boolean; pubkey?: string; reason: string } {
  // First do standard event validation
  const validation = validateAndVerifyEvent(event);
  if (!validation.ok) {
    return { ok: false, reason: validation.reason };
  }

  const e = event as NostrEvent;

  if (e.kind !== KIND_AUTH) {
    return { ok: false, reason: "invalid: AUTH event must be kind 22242" };
  }

  // Check created_at is within window
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - e.created_at) > AUTH_WINDOW_SECONDS) {
    return {
      ok: false,
      reason: "invalid: AUTH event timestamp too far from current time",
    };
  }

  // Check challenge tag
  const challengeTag = e.tags.find(([t]) => t === "challenge");
  if (challengeTag?.[1] !== challenge) {
    return { ok: false, reason: "invalid: AUTH challenge mismatch" };
  }

  // Check relay tag (just verify the domain matches)
  const relayTag = e.tags.find(([t]) => t === "relay");
  if (!relayTag?.[1]) {
    return { ok: false, reason: "invalid: AUTH event missing relay tag" };
  }

  return { ok: true, pubkey: e.pubkey, reason: "" };
}

/**
 * Check if a REQ filter requires authentication (queries kind:1059 gift wraps).
 */
export function filterRequiresAuth(filter: Filter): boolean {
  return filter.kinds?.includes(KIND_GIFT_WRAP) ?? false;
}

/**
 * Check if a CHANGES filter requires authentication (queries kind:1059 gift wraps).
 */
export function changesFilterRequiresAuth(filter: ChangesFilter): boolean {
  return filter.kinds?.includes(KIND_GIFT_WRAP) ?? false;
}

/**
 * Validate that an authenticated connection is authorized to query with the given filter.
 * For kind:1059 queries, the #p filter must only contain the authed pubkey(s).
 */
export function isAuthorizedForFilter(
  filter: Filter,
  authedPubkeys: Set<string>,
): { authorized: boolean; reason: string } {
  if (!filterRequiresAuth(filter)) {
    return { authorized: true, reason: "" };
  }

  if (authedPubkeys.size === 0) {
    return {
      authorized: false,
      reason: "auth-required: authentication required to query gift wraps",
    };
  }

  // Must have a #p filter
  const pValues = filter["#p"];
  if (!Array.isArray(pValues) || pValues.length === 0) {
    return {
      authorized: false,
      reason: "restricted: gift wrap queries must include a #p filter",
    };
  }

  // All p-tag values must be authed pubkeys
  for (const p of pValues) {
    if (!authedPubkeys.has(p)) {
      return {
        authorized: false,
        reason: "restricted: can only query gift wraps addressed to you",
      };
    }
  }

  return { authorized: true, reason: "" };
}

/**
 * Same as isAuthorizedForFilter but for CHANGES filters.
 */
export function isAuthorizedForChangesFilter(
  filter: ChangesFilter,
  authedPubkeys: Set<string>,
): { authorized: boolean; reason: string } {
  if (!changesFilterRequiresAuth(filter)) {
    return { authorized: true, reason: "" };
  }

  if (authedPubkeys.size === 0) {
    return {
      authorized: false,
      reason: "auth-required: authentication required to query gift wraps",
    };
  }

  const pValues = filter["#p"];
  if (!Array.isArray(pValues) || pValues.length === 0) {
    return {
      authorized: false,
      reason: "restricted: gift wrap queries must include a #p filter",
    };
  }

  for (const p of pValues) {
    if (!authedPubkeys.has(p)) {
      return {
        authorized: false,
        reason: "restricted: can only query gift wraps addressed to you",
      };
    }
  }

  return { authorized: true, reason: "" };
}
