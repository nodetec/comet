import type { NostrEvent } from "@comet/nostr";
import type { VisibleVectorClock } from "./domain/snapshots/vector-clock";

export const SNAPSHOT_SYNC_EVENT_KIND = 42_061;
export const RELAY_AUTH_EVENT_KIND = 22_242;

export type SnapshotOp = "put" | "del";

export type SnapshotEnvelope = {
  authorPubkey: string;
  documentCoord: string;
  op: SnapshotOp;
  mtime: number;
  vectorClock: VisibleVectorClock;
  entityType: string | null;
  event: NostrEvent;
};

export type RelayKindClassification =
  | "snapshot"
  | "companion"
  | "pass-through"
  | "unsupported";

export type RelayFilter = {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number;
  until?: number;
  limit?: number;
  [key: `#${string}`]: string[] | undefined | number;
};

export type SnapshotChangesFilter = {
  mode?: "bootstrap" | "tail";
  since?: number;
  until_seq?: number;
  limit?: number;
  kinds?: number[];
  authors?: string[];
  live?: boolean;
  [key: `#${string}`]: string[] | undefined | number | boolean;
};

export type SnapshotRelayConfig = {
  port: number;
  host: string;
  databaseUrl: string;
  relayUrl: string;
  privateMode: boolean;
  adminToken: string | null;
  defaultPayloadRetentionDays: number | null;
  defaultCompactionIntervalSeconds: number;
  companionKinds: number[];
  passThroughKinds: number[];
};

export type RelayRetentionPolicy = {
  payloadRetentionDays: number | null;
  compactionIntervalSeconds: number;
  updatedAt: number | null;
};

export type AccessKey = {
  key: string;
  label: string | null;
  pubkey: string | null;
  storageLimitBytes: number | null;
  expiresAt: number | null;
  revoked: boolean;
  createdAt: number;
};
