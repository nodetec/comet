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

  const recipient = getSingleTag(event.tags, "p");
  const documentId = getSingleTag(event.tags, "d");
  const revisionId = getSingleTag(event.tags, "r");
  const op = parseRevisionOp(getSingleTag(event.tags, "op"));
  const mtimeText = getSingleTag(event.tags, "m");
  const mtime = Number.parseInt(mtimeText ?? "", 10);

  if (
    !recipient ||
    !documentId ||
    !revisionId ||
    !op ||
    !Number.isFinite(mtime) ||
    !isHex64(revisionId)
  ) {
    return null;
  }

  const parentRevisionIds = event.tags
    .filter(([tagName]) => tagName === "prev")
    .map(([, value]) => value)
    .filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    );

  if (!parentRevisionIds.every(isHex64)) {
    return null;
  }

  return {
    recipient,
    documentId,
    revisionId,
    parentRevisionIds,
    op,
    mtime,
    entityType: getSingleTag(event.tags, "type"),
    schemaVersion: getSingleTag(event.tags, "v"),
    event,
  };
}
