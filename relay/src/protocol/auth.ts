import { validateAndVerifyEvent, type NostrEvent } from "@comet/nostr";

import {
  RELAY_AUTH_EVENT_KIND,
  REVISION_SYNC_EVENT_KIND,
  type RelayFilter,
  type RevisionChangesFilter,
} from "../types";

const AUTH_WINDOW_SECONDS = 600;

export function requiresAuthForEventKind(kind: number): boolean {
  return kind === REVISION_SYNC_EVENT_KIND;
}

export function validateAuthEvent(
  event: unknown,
  challenge: string,
): { ok: boolean; pubkey?: string; reason: string } {
  const validation = validateAndVerifyEvent(event);
  if (!validation.ok) {
    return { ok: false, reason: validation.reason };
  }

  const nostrEvent = event as NostrEvent;
  if (nostrEvent.kind !== RELAY_AUTH_EVENT_KIND) {
    return {
      ok: false,
      reason: `invalid: AUTH event must be kind ${RELAY_AUTH_EVENT_KIND}`,
    };
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - nostrEvent.created_at) > AUTH_WINDOW_SECONDS) {
    return {
      ok: false,
      reason: "invalid: AUTH event timestamp too far from current time",
    };
  }

  const challengeTag = nostrEvent.tags.find(([tag]) => tag === "challenge");
  if (challengeTag?.[1] !== challenge) {
    return { ok: false, reason: "invalid: AUTH challenge mismatch" };
  }

  const relayTag = nostrEvent.tags.find(([tag]) => tag === "relay");
  if (!relayTag?.[1]) {
    return { ok: false, reason: "invalid: AUTH event missing relay tag" };
  }

  return { ok: true, pubkey: nostrEvent.pubkey, reason: "" };
}

export function isAuthorizedForRevisionFilters(
  filters: RelayFilter[],
  authedPubkeys: Set<string>,
): { authorized: boolean; reason: string } {
  if (authedPubkeys.size === 0) {
    return {
      authorized: false,
      reason: "auth-required: authentication required for revision queries",
    };
  }

  for (const filter of filters) {
    const pValues = filter["#p"];
    if (!Array.isArray(pValues) || pValues.length === 0) {
      return {
        authorized: false,
        reason: "restricted: revision queries must include a #p filter",
      };
    }

    for (const recipient of pValues) {
      if (!authedPubkeys.has(recipient)) {
        return {
          authorized: false,
          reason: "restricted: can only query revision state addressed to you",
        };
      }
    }
  }

  return { authorized: true, reason: "" };
}

export function isAuthorizedForChangesFilter(
  filter: RevisionChangesFilter,
  authedPubkeys: Set<string>,
): { authorized: boolean; reason: string } {
  if (authedPubkeys.size === 0) {
    return {
      authorized: false,
      reason: "auth-required: authentication required for revision changes",
    };
  }

  const pValues = filter["#p"];
  if (!Array.isArray(pValues) || pValues.length === 0) {
    return {
      authorized: false,
      reason: "restricted: revision CHANGES must include a #p filter",
    };
  }

  for (const recipient of pValues) {
    if (!authedPubkeys.has(recipient)) {
      return {
        authorized: false,
        reason: "restricted: can only query revision changes addressed to you",
      };
    }
  }

  return { authorized: true, reason: "" };
}

export function isAuthorizedForRevisionRecipient(
  recipient: string,
  authedPubkeys: Set<string>,
): { authorized: boolean; reason: string } {
  if (authedPubkeys.size === 0) {
    return {
      authorized: false,
      reason: "auth-required: authentication required for revision writes",
    };
  }

  if (!authedPubkeys.has(recipient)) {
    return {
      authorized: false,
      reason: "restricted: can only write revision state addressed to you",
    };
  }

  return { authorized: true, reason: "" };
}
