import type { NostrEvent } from "@comet/nostr";

import {
  SNAPSHOT_SYNC_EVENT_KIND,
  type RelayKindClassification,
} from "../../types";

export type KindPolicy = {
  companionKinds: readonly number[];
  passThroughKinds: readonly number[];
};

export function classifyEventKind(
  kind: number,
  policy: KindPolicy,
): RelayKindClassification {
  if (kind === SNAPSHOT_SYNC_EVENT_KIND) {
    return "snapshot";
  }
  if (policy.companionKinds.includes(kind)) {
    return "companion";
  }
  if (policy.passThroughKinds.includes(kind)) {
    return "pass-through";
  }
  return "unsupported";
}

export function classifyEvent(
  event: NostrEvent,
  policy: KindPolicy,
): RelayKindClassification {
  return classifyEventKind(event.kind, policy);
}
