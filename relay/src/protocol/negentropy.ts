import { REVISION_NEGENTROPY_STRATEGY } from "../types";

export type NegOpenMessage = ["NEG-OPEN", string, Record<string, unknown>];
export type NegMsgMessage = ["NEG-MSG", string, string];
export type NegCloseMessage = ["NEG-CLOSE", string];
export type NegErrMessage = ["NEG-ERR", string, string];
export type NegStatusMessage = [
  "NEG-STATUS",
  string,
  {
    strategy: string;
    snapshot_seq: number;
  },
];

export function isNegOpenMessage(value: unknown): value is NegOpenMessage {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value[0] === "NEG-OPEN" &&
    typeof value[1] === "string" &&
    typeof value[2] === "object" &&
    value[2] !== null
  );
}

export function isNegMsgMessage(value: unknown): value is NegMsgMessage {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value[0] === "NEG-MSG" &&
    typeof value[1] === "string" &&
    typeof value[2] === "string"
  );
}

export function isNegCloseMessage(value: unknown): value is NegCloseMessage {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value[0] === "NEG-CLOSE" &&
    typeof value[1] === "string"
  );
}

export function createNegStatusMessage(
  subscriptionId: string,
  snapshotSeq: number,
): NegStatusMessage {
  return [
    "NEG-STATUS",
    subscriptionId,
    {
      strategy: REVISION_NEGENTROPY_STRATEGY,
      snapshot_seq: snapshotSeq,
    },
  ];
}

export function createNegMsgMessage(
  subscriptionId: string,
  payload: string,
): NegMsgMessage {
  return ["NEG-MSG", subscriptionId, payload];
}

export function createNegErrMessage(
  subscriptionId: string,
  message: string,
): NegErrMessage {
  return ["NEG-ERR", subscriptionId, message];
}
