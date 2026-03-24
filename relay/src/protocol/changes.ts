import type { NostrEvent } from "@comet/nostr";

import type { RevisionChangesFilter } from "../types";

export type ChangesRequestMessage = ["CHANGES", string, RevisionChangesFilter];
export type ChangesEventMessage = [
  "CHANGES",
  string,
  "EVENT",
  number,
  NostrEvent,
];
export type ChangesEoseMessage = ["CHANGES", string, "EOSE", number];
export type ChangesErrMessage = ["CHANGES", string, "ERR", string];

export function isChangesRequestMessage(
  value: unknown,
): value is ChangesRequestMessage {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value[0] === "CHANGES" &&
    typeof value[1] === "string" &&
    typeof value[2] === "object" &&
    value[2] !== null
  );
}
