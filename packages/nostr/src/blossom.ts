import { validateAndVerifyEvent } from "./event";
import type { NostrEvent } from "./types";

export const KIND_BLOSSOM_AUTH = 24242;

export type BlossomAction = "delete" | "list" | "upload";

export type BlossomAuthResult =
  | { ok: true; pubkey: string; hashes: string[] }
  | { ok: false; reason: string };

function decodeAuthHeader(authHeader: string): string {
  return Buffer.from(authHeader.slice(6), "base64url").toString("utf8");
}

export function validateBlossomAuth(
  authHeader: string | undefined,
  expectedAction: BlossomAction,
  options?: { sha256?: string; sha256s?: string[] },
): BlossomAuthResult {
  if (authHeader?.startsWith("Nostr ") !== true) {
    return { ok: false, reason: "missing or invalid Authorization header" };
  }

  let eventJson: string;
  try {
    eventJson = decodeAuthHeader(authHeader);
  } catch {
    return { ok: false, reason: "invalid base64 in Authorization header" };
  }

  let event: unknown;
  try {
    event = JSON.parse(eventJson);
  } catch {
    return { ok: false, reason: "invalid JSON in Authorization header" };
  }

  const validation = validateAndVerifyEvent(event);
  if (!validation.ok) {
    return { ok: false, reason: validation.reason };
  }

  const nostrEvent = event as NostrEvent;
  if (nostrEvent.kind !== KIND_BLOSSOM_AUTH) {
    return {
      ok: false,
      reason: `invalid kind: expected ${KIND_BLOSSOM_AUTH}`,
    };
  }

  const expirationTag = nostrEvent.tags.find(([tag]) => tag === "expiration");
  if (expirationTag?.[1]) {
    const expiration = Number.parseInt(expirationTag[1], 10);
    const now = Math.floor(Date.now() / 1000);
    if (expiration < now) {
      return { ok: false, reason: "authorization expired" };
    }
  }

  const actionTag = nostrEvent.tags.find(([tag]) => tag === "t");
  if (actionTag?.[1] !== expectedAction) {
    return {
      ok: false,
      reason: `invalid action: expected "${expectedAction}"`,
    };
  }

  const hashTags = nostrEvent.tags
    .filter(([tag]) => tag === "x")
    .map(([, value]) => value)
    .filter((value): value is string => typeof value === "string");

  if (options?.sha256) {
    if (!hashTags.includes(options.sha256)) {
      return { ok: false, reason: "sha256 mismatch in x tag" };
    }
  }

  if (options?.sha256s && options.sha256s.length > 0) {
    const missingHashes = options.sha256s.filter(
      (hash) => !hashTags.includes(hash),
    );
    if (missingHashes.length > 0) {
      return {
        ok: false,
        reason: "sha256 mismatch in x tags",
      };
    }
  }

  return { ok: true, pubkey: nostrEvent.pubkey, hashes: hashTags };
}
