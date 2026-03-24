import { type NostrEvent } from "@comet/nostr";
import { finalizeEvent, getPublicKey } from "nostr-tools";

import { REVISION_SYNC_EVENT_KIND } from "../../src/types";
import type { RevisionRelayTestContext } from "../helpers";

export const REV_A =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
export const REV_B =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
export const REV_C =
  "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
export const AUTH_SECRET_HEX =
  "1111111111111111111111111111111111111111111111111111111111111111";
export const AUTH_PUBKEY = getPublicKey(hexToBytes(AUTH_SECRET_HEX));

export function revisionEvent(
  revisionId: string,
  mtime = 1_700_000_000_000,
  parentRevisionIds: string[] = [],
  documentCoord = "doc-1",
  op: "put" | "del" = "put",
  recipient = "recipient-1",
): NostrEvent {
  return {
    id: `event-${revisionId}`,
    pubkey: "sender-1",
    created_at: 1_700_000_000,
    kind: REVISION_SYNC_EVENT_KIND,
    tags: [
      ["p", recipient],
      ["d", documentCoord],
      ["r", revisionId],
      ...parentRevisionIds.map((parentRevisionId) => [
        "prev",
        parentRevisionId,
      ]),
      ["op", op],
      ["m", `${mtime}`],
      ["type", "note"],
      ["v", "2"],
    ],
    content: `ciphertext-${revisionId}`,
    sig: `sig-${revisionId}`,
  };
}

export function revisionEventForRecipient(
  revisionId: string,
  recipient: string,
  mtime = 1_700_000_000_000,
  parentRevisionIds: string[] = [],
  documentCoord = "doc-1",
  op: "put" | "del" = "put",
): NostrEvent {
  return revisionEvent(
    revisionId,
    mtime,
    parentRevisionIds,
    documentCoord,
    op,
    recipient,
  );
}

export function deletionRevisionEvent(
  revisionId: string,
  mtime = 1_700_000_000_000,
  parentRevisionIds: string[] = [],
  documentCoord = "doc-1",
): NostrEvent {
  return revisionEvent(
    revisionId,
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
      kind: 22242,
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

export function traceOptions(context: RevisionRelayTestContext, label: string) {
  return { context, label };
}

export async function cleanupContexts(contexts: RevisionRelayTestContext[]) {
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
