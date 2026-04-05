import { validateAndVerifyEvent, type NostrEvent } from "@comet/nostr";

import {
  RELAY_AUTH_EVENT_KIND,
  SNAPSHOT_SYNC_EVENT_KIND,
  type RelayFilter,
  type SnapshotChangesFilter,
} from "../types";

const AUTH_WINDOW_SECONDS = 600;

export function requiresAuthForEventKind(kind: number): boolean {
  return kind === SNAPSHOT_SYNC_EVENT_KIND;
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

export function isAuthorizedForSnapshotFilters(
  filters: RelayFilter[],
  authedPubkeys: Set<string>,
): { authorized: boolean; reason: string } {
  if (authedPubkeys.size === 0) {
    return {
      authorized: false,
      reason: "auth-required: authentication required for snapshot queries",
    };
  }

  for (const filter of filters) {
    const authorValues = filter.authors;
    if (!Array.isArray(authorValues) || authorValues.length === 0) {
      return {
        authorized: false,
        reason: "restricted: snapshot queries must include an authors filter",
      };
    }

    for (const author of authorValues) {
      if (!authedPubkeys.has(author)) {
        return {
          authorized: false,
          reason: "restricted: can only query your own snapshot state",
        };
      }
    }
  }

  return { authorized: true, reason: "" };
}

export function isAuthorizedForChangesFilter(
  filter: SnapshotChangesFilter,
  authedPubkeys: Set<string>,
): { authorized: boolean; reason: string } {
  if (authedPubkeys.size === 0) {
    return {
      authorized: false,
      reason: "auth-required: authentication required for snapshot changes",
    };
  }

  const authorValues = filter.authors;
  if (!Array.isArray(authorValues) || authorValues.length === 0) {
    return {
      authorized: false,
      reason: "restricted: snapshot CHANGES must include an authors filter",
    };
  }

  for (const author of authorValues) {
    if (!authedPubkeys.has(author)) {
      return {
        authorized: false,
        reason: "restricted: can only query your own snapshot changes",
      };
    }
  }

  return { authorized: true, reason: "" };
}

export function isAuthorizedForSnapshotAuthor(
  authorPubkey: string,
  authedPubkeys: Set<string>,
): { authorized: boolean; reason: string } {
  if (authedPubkeys.size === 0) {
    return {
      authorized: false,
      reason: "auth-required: authentication required for snapshot writes",
    };
  }

  if (!authedPubkeys.has(authorPubkey)) {
    return {
      authorized: false,
      reason: "restricted: can only write your own snapshot state",
    };
  }

  return { authorized: true, reason: "" };
}
