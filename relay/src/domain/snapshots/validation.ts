import type { NostrEvent } from "@comet/nostr";

import {
  SNAPSHOT_SYNC_EVENT_KIND,
  type SnapshotEnvelope,
  type SnapshotOp,
} from "../../types";
import { parseVisibleVectorClockFromTags } from "./vector-clock";

function getSingleTag(tags: string[][], name: string): string | null {
  const tag = tags.find(([tagName]) => tagName === name);
  return tag?.[1] ?? null;
}

function getEntityTypeTag(tags: string[][]): string | null {
  return getSingleTag(tags, "c");
}

function parseSnapshotOp(value: string | null): SnapshotOp | null {
  if (value === "put" || value === "del") {
    return value;
  }
  return null;
}

export function parseSnapshotEnvelope(
  event: NostrEvent,
): SnapshotEnvelope | null {
  if (event.kind !== SNAPSHOT_SYNC_EVENT_KIND) {
    return null;
  }

  const documentCoord = getSingleTag(event.tags, "d");
  const op = parseSnapshotOp(getSingleTag(event.tags, "o"));
  const mtime = event.created_at * 1000;
  const vectorClock = parseVisibleVectorClockFromTags(event.tags);

  if (!documentCoord || !op || !vectorClock) {
    return null;
  }

  return {
    authorPubkey: event.pubkey,
    documentCoord,
    op,
    mtime,
    vectorClock,
    entityType: getEntityTypeTag(event.tags),
    event,
  };
}
