import type { NostrEvent } from "../../types";

export const KIND_GIFT_WRAP = 1059;
export const KIND_SEAL = 13;

export function isGiftWrap(event: NostrEvent): boolean {
  return event.kind === KIND_GIFT_WRAP;
}

export function isSeal(event: NostrEvent): boolean {
  return event.kind === KIND_SEAL;
}

/**
 * Validate gift wrap structure.
 * Returns null if valid, or a rejection reason.
 */
export function validateGiftWrap(event: NostrEvent): string | null {
  if (!isGiftWrap(event)) return null;

  // Must have at least one p tag (recipient)
  const pTags = event.tags.filter(([t]) => t === "p");
  if (pTags.length === 0) {
    return "invalid: gift wrap must have at least one 'p' tag (recipient)";
  }

  return null;
}

/**
 * Validate seal structure.
 * Returns null if valid, or a rejection reason.
 */
export function validateSeal(event: NostrEvent): string | null {
  if (!isSeal(event)) return null;

  // Seal tags MUST always be empty
  if (event.tags.length > 0) {
    return "invalid: seal must have empty tags";
  }

  return null;
}

/**
 * Check if a deletion author is authorized to delete a gift wrap event.
 * Gift wraps use random ephemeral signing keys, so normal pubkey matching fails.
 * Instead, the deletion author must appear in the gift wrap's p-tags.
 */
export function canDeleteGiftWrap(
  giftWrap: NostrEvent,
  deletionAuthorPubkey: string,
): boolean {
  return giftWrap.tags.some(
    ([t, v]) => t === "p" && v === deletionAuthorPubkey,
  );
}
