import type { NostrEvent } from "@comet/nostr";

export const REVISION_SYNC_EVENT_KIND = 1059;
export const REVISION_NEGENTROPY_STRATEGY = "revision-sync.v1";
export const RELAY_AUTH_EVENT_KIND = 22242;

export type RevisionOp = "put" | "del";

export type RevisionEnvelope = {
  recipient: string;
  documentCoord: string;
  revisionId: string;
  parentRevisionIds: string[];
  op: RevisionOp;
  mtime: number;
  entityType: string | null;
  schemaVersion: string | null;
  event: NostrEvent;
};

export type RevisionHead = {
  recipient: string;
  documentCoord: string;
  revisionId: string;
  op: RevisionOp;
  mtime: number;
};

export type RevisionScope = {
  recipient: string;
  documentCoords?: string[];
  revisionIds?: string[];
};

export type RelayKindClassification =
  | "revision"
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

export type RevisionChangesFilter = {
  since?: number;
  until_seq?: number;
  limit?: number;
  kinds?: number[];
  authors?: string[];
  live?: boolean;
  [key: `#${string}`]: string[] | undefined | number | boolean;
};

export type NegentropyItem = {
  id: string;
  timestamp: number;
};

export type RevisionRelayConfig = {
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

export type AllowedUser = {
  pubkey: string;
  expiresAt: number | null;
  storageLimitBytes: number | null;
  createdAt: number;
};
