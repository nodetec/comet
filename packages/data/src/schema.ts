import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(),
    pubkey: text("pubkey").notNull(),
    recipient: text("recipient"),
    dTag: text("d_tag"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    kind: integer("kind").notNull(),
    tags: jsonb("tags").notNull().$type<string[][]>(),
    content: text("content").notNull(),
    sig: text("sig").notNull(),
    firstSeen: bigint("first_seen", { mode: "number" })
      .notNull()
      .default(sql`(EXTRACT(EPOCH FROM NOW())::BIGINT)`),
  },
  (table) => [
    index("idx_events_created_at").on(table.createdAt),
    index("idx_events_kind_created_at").on(table.kind, table.createdAt),
    index("idx_events_recipient").on(table.recipient),
    index("idx_events_pubkey_kind_dtag").on(
      table.pubkey,
      table.kind,
      table.dTag,
    ),
  ],
);

export const eventTags = pgTable(
  "event_tags",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    tagName: text("tag_name").notNull(),
    tagValue: text("tag_value").notNull(),
  },
  (table) => [
    index("idx_event_tags_event_id").on(table.eventId),
    index("idx_tags_lookup").on(table.tagName, table.tagValue),
  ],
);

export const deletedEvents = pgTable("deleted_events", {
  eventId: text("event_id").notNull().primaryKey(),
  deletionId: text("deletion_id").notNull(),
  pubkey: text("pubkey").notNull(),
});

export const deletedCoords = pgTable(
  "deleted_coords",
  {
    kind: integer("kind").notNull(),
    pubkey: text("pubkey").notNull(),
    dTag: text("d_tag").notNull(),
    deletedUpTo: bigint("deleted_up_to", { mode: "number" }).notNull(),
    deletionId: text("deletion_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.kind, table.pubkey, table.dTag] })],
);

export const changes = pgTable(
  "changes",
  {
    seq: bigint("seq", { mode: "number" })
      .generatedAlwaysAsIdentity()
      .primaryKey(),
    eventId: text("event_id").notNull(),
    type: text("type", { enum: ["STORED", "DELETED"] }).notNull(),
    kind: integer("kind").notNull(),
    pubkey: text("pubkey").notNull(),
    reason: text("reason"),
    tags: jsonb("tags").$type<[string, string][] | null>(),
  },
  (table) => [
    index("idx_changes_kind").on(table.kind),
    index("idx_changes_pubkey").on(table.pubkey),
  ],
);

export const changeTags = pgTable(
  "change_tags",
  {
    seq: bigint("seq", { mode: "number" })
      .notNull()
      .references(() => changes.seq, { onDelete: "cascade" }),
    tagName: text("tag_name").notNull(),
    tagValue: text("tag_value").notNull(),
  },
  (table) => [
    index("idx_change_tags_seq").on(table.seq),
    index("idx_change_tags_lookup").on(table.tagName, table.tagValue),
  ],
);

export const inviteCodes = pgTable("invite_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  maxUses: integer("max_uses").notNull().default(1),
  useCount: integer("use_count").notNull().default(0),
  expiresAt: bigint("expires_at", { mode: "number" }),
  revoked: boolean("revoked").notNull().default(false),
  createdAt: bigint("created_at", { mode: "number" })
    .notNull()
    .default(sql`(EXTRACT(EPOCH FROM NOW())::BIGINT)`),
});

export const blobs = pgTable("blobs", {
  sha256: text("sha256").primaryKey(),
  size: bigint("size", { mode: "number" }).notNull(),
  type: text("type"),
  uploadedAt: bigint("uploaded_at", { mode: "number" })
    .notNull()
    .default(sql`(EXTRACT(EPOCH FROM NOW())::BIGINT)`),
});

export const blobOwners = pgTable(
  "blob_owners",
  {
    sha256: text("sha256")
      .notNull()
      .references(() => blobs.sha256, { onDelete: "cascade" }),
    pubkey: text("pubkey").notNull(),
    accessKey: text("access_key"),
    createdAt: bigint("created_at", { mode: "number" })
      .notNull()
      .default(sql`(EXTRACT(EPOCH FROM NOW())::BIGINT)`),
  },
  (table) => [
    primaryKey({ columns: [table.sha256, table.pubkey] }),
    index("idx_blob_owners_pubkey").on(table.pubkey),
    index("idx_blob_owners_access_key").on(table.accessKey),
  ],
);

export const relayEvents = pgTable(
  "relay_events",
  {
    id: text("id").primaryKey(),
    pubkey: text("pubkey").notNull(),
    kind: integer("kind").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    tags: jsonb("tags").notNull().$type<string[][]>(),
    content: text("content").notNull(),
    sig: text("sig").notNull(),
  },
  (table) => [
    index("idx_relay_events_kind_created_at").on(table.kind, table.createdAt),
  ],
);

export const relayEventTags = pgTable(
  "relay_event_tags",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => relayEvents.id, { onDelete: "cascade" }),
    tagName: text("tag_name").notNull(),
    tagValue: text("tag_value").notNull(),
  },
  (table) => [
    index("idx_relay_event_tags_lookup").on(table.tagName, table.tagValue),
  ],
);

// Immutable snapshot metadata keyed by author + document scope + event id.
export const syncSnapshots = pgTable(
  "sync_snapshots",
  {
    authorPubkey: text("author_pubkey").notNull(),
    dTag: text("d_tag").notNull(),
    snapshotId: text("snapshot_id").notNull(),
    op: text("op", { enum: ["put", "del"] }).notNull(),
    mtime: bigint("mtime", { mode: "number" }).notNull(),
    vectorClock: jsonb("vector_clock")
      .notNull()
      .$type<Record<string, number>>(),
    entityType: text("entity_type"),
    eventId: text("event_id"),
    payloadRetained: integer("payload_retained").notNull().default(1),
    storedSeq: bigint("stored_seq", { mode: "number" }),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.authorPubkey, table.dTag, table.snapshotId] }),
    index("idx_sync_snapshots_scope").on(table.authorPubkey, table.dTag),
    index("idx_sync_snapshots_snapshot_id").on(table.snapshotId),
    index("idx_sync_snapshots_mtime").on(table.mtime),
    index("idx_sync_snapshots_entity_type").on(table.entityType),
  ],
);

export const syncPayloads = pgTable(
  "sync_payloads",
  {
    eventId: text("event_id").primaryKey(),
    authorPubkey: text("author_pubkey").notNull(),
    dTag: text("d_tag").notNull(),
    snapshotId: text("snapshot_id").notNull(),
    pubkey: text("pubkey").notNull(),
    kind: integer("kind").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    tags: jsonb("tags").notNull().$type<string[][]>(),
    content: text("content").notNull(),
    sig: text("sig").notNull(),
  },
  (table) => [
    index("idx_sync_payloads_snapshot_id").on(
      table.authorPubkey,
      table.dTag,
      table.snapshotId,
    ),
  ],
);

export const syncChanges = pgTable(
  "sync_changes",
  {
    seq: bigint("seq", { mode: "number" })
      .generatedAlwaysAsIdentity()
      .primaryKey(),
    authorPubkey: text("author_pubkey").notNull(),
    dTag: text("d_tag").notNull(),
    snapshotId: text("snapshot_id").notNull(),
    eventId: text("event_id").notNull(),
    op: text("op", { enum: ["put", "del"] }).notNull(),
    mtime: bigint("mtime", { mode: "number" }).notNull(),
  },
  (table) => [
    index("idx_sync_changes_seq").on(table.seq),
    index("idx_sync_changes_scope_seq").on(table.authorPubkey, table.seq),
    index("idx_sync_changes_document_seq").on(
      table.authorPubkey,
      table.dTag,
      table.seq,
    ),
  ],
);

export const relaySettings = pgTable("relay_settings", {
  id: integer("id").primaryKey(),
  payloadRetentionDays: integer("payload_retention_days"),
  compactionIntervalSeconds: integer("compaction_interval_seconds")
    .notNull()
    .default(300),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const accessKeys = pgTable(
  "access_keys",
  {
    key: text("key").primaryKey(),
    label: text("label"),
    pubkey: text("pubkey"),
    storageLimitBytes: bigint("storage_limit_bytes", { mode: "number" }),
    expiresAt: bigint("expires_at", { mode: "number" }),
    revoked: boolean("revoked").notNull().default(false),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("idx_access_keys_created_at").on(table.createdAt),
    index("idx_access_keys_pubkey").on(table.pubkey),
  ],
);

export const accessKeyPubkeys = pgTable(
  "access_key_pubkeys",
  {
    accessKey: text("access_key")
      .notNull()
      .references(() => accessKeys.key, { onDelete: "cascade" }),
    pubkey: text("pubkey").notNull(),
    firstSeen: bigint("first_seen", { mode: "number" }).notNull(),
    lastSeen: bigint("last_seen", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.accessKey, table.pubkey] }),
    index("idx_access_key_pubkeys_pubkey").on(table.pubkey),
  ],
);
