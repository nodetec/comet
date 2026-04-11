import { type NostrEvent } from "@comet/nostr";
import { finalizeEvent, getPublicKey } from "nostr-tools";

import { SNAPSHOT_SYNC_EVENT_KIND } from "../../src/types";
import type { SnapshotRelayTestContext } from "../helpers";

export const REV_A =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
export const REV_B =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
export const REV_C =
  "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
export const AUTH_SECRET_HEX =
  "1111111111111111111111111111111111111111111111111111111111111111";
export const AUTH_PUBKEY = getPublicKey(hexToBytes(AUTH_SECRET_HEX));

export function snapshotEvent(
  snapshotId: string,
  mtime = 1_700_000_000_000,
  _ignoredParents: string[] = [],
  documentCoord = "doc-1",
  op: "put" | "del" = "put",
  authorPubkey = "author-1",
  vectorClock: Record<string, number> = {
    "DEVICE-A": mtime,
  },
): NostrEvent {
  return {
    id: `event-${snapshotId}`,
    pubkey: authorPubkey,
    created_at: Math.floor(mtime / 1000),
    kind: SNAPSHOT_SYNC_EVENT_KIND,
    tags: [
      ["d", documentCoord],
      ["o", op],
      ["c", "notes"],
      ...Object.entries(vectorClock)
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([deviceId, counter]) => ["vc", deviceId, String(counter)]),
    ],
    content: `ciphertext-${snapshotId}`,
    sig: `sig-${snapshotId}`,
  };
}

export function snapshotEventForAuthor(
  snapshotId: string,
  authorPubkey: string,
  mtime = 1_700_000_000_000,
  parentRevisionIds: string[] = [],
  documentCoord = "doc-1",
  op: "put" | "del" = "put",
): NostrEvent {
  return snapshotEvent(
    snapshotId,
    mtime,
    parentRevisionIds,
    documentCoord,
    op,
    authorPubkey,
  );
}

export function deletionSnapshotEvent(
  snapshotId: string,
  mtime = 1_700_000_000_000,
  parentRevisionIds: string[] = [],
  documentCoord = "doc-1",
): NostrEvent {
  return snapshotEvent(
    snapshotId,
    mtime,
    parentRevisionIds,
    documentCoord,
    "del",
  );
}

export function authEvent(
  challenge: string,
  relayUrl: string,
  options: {
    secretHex?: string;
    createdAt?: number;
  } = {},
): NostrEvent {
  const secretHex = options.secretHex ?? AUTH_SECRET_HEX;
  const createdAt = options.createdAt ?? Math.floor(Date.now() / 1000);
  return finalizeEvent(
    {
      kind: 22_242,
      created_at: createdAt,
      tags: [
        ["challenge", challenge],
        ["relay", relayUrl],
      ],
      content: "",
    },
    hexToBytes(secretHex),
  ) as NostrEvent;
}

export function genericEvent(
  id: string,
  kind: number,
  tags: string[][] = [],
): NostrEvent {
  return {
    id,
    pubkey: "generic-sender-1",
    created_at: 1_700_000_000,
    kind,
    tags,
    content: `generic-content-${id}`,
    sig: `generic-sig-${id}`,
  };
}

export function traceOptions(context: SnapshotRelayTestContext, label: string) {
  return { context, label };
}

export async function cleanupContexts(contexts: SnapshotRelayTestContext[]) {
  while (contexts.length > 0) {
    const context = contexts.pop();
    if (context) {
      await context.cleanup();
    }
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < hex.length; index += 2) {
    bytes[index / 2] = Number.parseInt(hex.slice(index, index + 2), 16);
  }
  return bytes;
}
