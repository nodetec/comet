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
    createdAt: bigint("created_at", { mode: "number" })
      .notNull()
      .default(sql`(EXTRACT(EPOCH FROM NOW())::BIGINT)`),
  },
  (table) => [
    primaryKey({ columns: [table.sha256, table.pubkey] }),
    index("idx_blob_owners_pubkey").on(table.pubkey),
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

// Immutable revision metadata keyed by recipient + document scope + revision id.
// This is the revision graph record, not the app's current materialized state.
export const syncRevisions = pgTable(
  "sync_revisions",
  {
    recipient: text("recipient").notNull(),
    dTag: text("d_tag").notNull(),
    rev: text("rev").notNull(),
    op: text("op", { enum: ["put", "del"] }).notNull(),
    mtime: bigint("mtime", { mode: "number" }).notNull(),
    entityType: text("entity_type"),
    payloadEventId: text("payload_event_id"),
    payloadRetained: integer("payload_retained").notNull().default(1),
    storedSeq: bigint("stored_seq", { mode: "number" }),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.recipient, table.dTag, table.rev] }),
    index("idx_sync_revisions_scope").on(table.recipient, table.dTag),
    index("idx_sync_revisions_rev").on(table.rev),
    index("idx_sync_revisions_mtime").on(table.mtime),
    index("idx_sync_revisions_entity_type").on(table.entityType),
  ],
);

export const syncRevisionParents = pgTable(
  "sync_revision_parents",
  {
    recipient: text("recipient").notNull(),
    dTag: text("d_tag").notNull(),
    rev: text("rev").notNull(),
    parentRev: text("parent_rev").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.recipient, table.dTag, table.rev, table.parentRev],
    }),
    index("idx_sync_revision_parents_rev").on(
      table.recipient,
      table.dTag,
      table.rev,
    ),
    index("idx_sync_revision_parents_parent_rev").on(
      table.recipient,
      table.dTag,
      table.parentRev,
    ),
  ],
);

// The full current head set for each sync document scope. This may contain
// multiple rows for a single `(recipient, d_tag)` when the document is
// conflicted.
//
// App-local `current_rev` pointers are a separate materialization concern and
// intentionally do not replace this head set.
export const syncHeads = pgTable(
  "sync_heads",
  {
    recipient: text("recipient").notNull(),
    dTag: text("d_tag").notNull(),
    rev: text("rev").notNull(),
    op: text("op", { enum: ["put", "del"] }).notNull(),
    mtime: bigint("mtime", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.recipient, table.dTag, table.rev] }),
    index("idx_sync_heads_scope").on(table.recipient, table.dTag),
    index("idx_sync_heads_mtime").on(table.mtime),
  ],
);

export const syncPayloads = pgTable(
  "sync_payloads",
  {
    eventId: text("event_id").primaryKey(),
    recipient: text("recipient").notNull(),
    dTag: text("d_tag").notNull(),
    rev: text("rev").notNull(),
    pubkey: text("pubkey").notNull(),
    kind: integer("kind").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    tags: jsonb("tags").notNull().$type<string[][]>(),
    content: text("content").notNull(),
    sig: text("sig").notNull(),
  },
  (table) => [
    index("idx_sync_payloads_rev").on(table.recipient, table.dTag, table.rev),
  ],
);

export const syncChanges = pgTable(
  "sync_changes",
  {
    seq: bigint("seq", { mode: "number" })
      .generatedAlwaysAsIdentity()
      .primaryKey(),
    recipient: text("recipient").notNull(),
    dTag: text("d_tag").notNull(),
    rev: text("rev").notNull(),
    eventId: text("event_id").notNull(),
    op: text("op", { enum: ["put", "del"] }).notNull(),
    mtime: bigint("mtime", { mode: "number" }).notNull(),
  },
  (table) => [
    index("idx_sync_changes_seq").on(table.seq),
    index("idx_sync_changes_scope_seq").on(table.recipient, table.seq),
    index("idx_sync_changes_document_seq").on(
      table.recipient,
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

export const relayAllowedUsers = pgTable(
  "relay_allowed_users",
  {
    pubkey: text("pubkey").primaryKey(),
    expiresAt: bigint("expires_at", { mode: "number" }),
    storageLimitBytes: bigint("storage_limit_bytes", { mode: "number" }),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (table) => [index("idx_relay_allowed_users_created_at").on(table.createdAt)],
);
