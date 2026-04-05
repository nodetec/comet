import type { NostrEvent } from "@comet/nostr";

import {
  REVISION_SYNC_EVENT_KIND,
  type RevisionEnvelope,
  type RevisionOp,
} from "../../types";

function getSingleTag(tags: string[][], name: string): string | null {
  const tag = tags.find(([tagName]) => tagName === name);
  return tag?.[1] ?? null;
}

function getEntityTypeTag(tags: string[][]): string | null {
  return getSingleTag(tags, "type");
}

function parseRevisionOp(value: string | null): RevisionOp | null {
  if (value === "put" || value === "del") {
    return value;
  }
  return null;
}

function isHex64(value: string): boolean {
  return /^[0-9a-f]{64}$/u.test(value);
}

export function parseRevisionEnvelope(
  event: NostrEvent,
): RevisionEnvelope | null {
  if (event.kind !== REVISION_SYNC_EVENT_KIND) {
    return null;
  }

  const documentCoord = getSingleTag(event.tags, "d");
  const revisionId = getSingleTag(event.tags, "r");
  const op = parseRevisionOp(getSingleTag(event.tags, "o"));
  const mtime = event.created_at * 1000;

  if (!documentCoord || !revisionId || !op || !isHex64(revisionId)) {
    return null;
  }

  const parentRevisionIds = event.tags
    .filter(([tagName]) => tagName === "b")
    .map(([, value]) => value)
    .filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    );

  if (!parentRevisionIds.every(isHex64)) {
    return null;
  }

  return {
    authorPubkey: event.pubkey,
    documentCoord,
    revisionId,
    parentRevisionIds,
    op,
    mtime,
    entityType: getEntityTypeTag(event.tags),
    schemaVersion: null,
    event,
  };
}
