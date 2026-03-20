import type { NostrEvent } from "../../types";

export const KIND_DELETION = 5;

export function isDeletionEvent(event: NostrEvent): boolean {
  return event.kind === KIND_DELETION;
}

/** Extract event IDs referenced by `e` tags in a deletion request. */
export function getDeletionTargetIds(event: NostrEvent): string[] {
  return event.tags
    .filter(([t]) => t === "e")
    .map(([, id]) => id)
    .filter((id) => typeof id === "string" && id.length > 0);
}

/**
 * Extract addressable event coordinates from `a` tags in a deletion request.
 * Format: `<kind>:<pubkey>:<d-identifier>`
 */
export function getDeletionTargetAddrs(event: NostrEvent): AddressPointer[] {
  return event.tags
    .filter(([t]) => t === "a")
    .map(([, coord]) => parseAddressCoord(coord))
    .filter((a): a is AddressPointer => a !== null);
}

export type AddressPointer = {
  kind: number;
  pubkey: string;
  dTag: string;
};

function parseAddressCoord(coord: string | undefined): AddressPointer | null {
  if (!coord) return null;
  const parts = coord.split(":");
  if (parts.length < 3) return null;
  const kind = parseInt(parts[0], 10);
  if (isNaN(kind)) return null;
  const pubkey = parts[1];
  const dTag = parts.slice(2).join(":");
  if (!pubkey || pubkey.length !== 64) return null;
  return { kind, pubkey, dTag };
}

/**
 * Validate a deletion request event.
 * Returns null if valid, or a rejection reason.
 */
export function validateDeletionEvent(event: NostrEvent): string | null {
  if (!isDeletionEvent(event)) return null;

  const eTargets = getDeletionTargetIds(event);
  const aTargets = getDeletionTargetAddrs(event);

  if (eTargets.length === 0 && aTargets.length === 0) {
    return "invalid: deletion request must reference at least one event via 'e' or 'a' tag";
  }

  // Validate that `a` tag targets have the same pubkey as the deletion author
  for (const addr of aTargets) {
    if (addr.pubkey !== event.pubkey) {
      return "invalid: 'a' tag references an event by a different author";
    }
  }

  return null;
}
