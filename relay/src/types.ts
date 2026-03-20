import type { NostrEvent } from "@comet/nostr";

export type { NostrEvent };

export type Filter = {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number;
  until?: number;
  limit?: number;
  [key: `#${string}`]: string[] | undefined | number;
};

export type ClientMessage =
  | ["EVENT", NostrEvent]
  | ["REQ", string, ...Filter[]]
  | ["CLOSE", string];

export type RelayMessage =
  | ["EVENT", string, NostrEvent]
  | ["OK", string, boolean, string]
  | ["EOSE", string]
  | ["CLOSED", string, string]
  | ["NOTICE", string];

// NIP-CF: Changes Feed

export type ChangesFilter = {
  since?: number;
  until_seq?: number;
  limit?: number;
  kinds?: number[];
  authors?: string[];
  live?: boolean;
  [key: `#${string}`]: string[] | undefined | number | boolean;
};

export type ChangeEntry = {
  seq: number;
  eventId: string;
  type: "STORED" | "DELETED";
  kind: number;
  pubkey: string;
  reason: ChangeReason | null;
  tags?: [string, string][]; // denormalized single-letter tags for filtering
};

export type ChangeReason = {
  deletion_id?: string;
  superseded_by?: string;
};
