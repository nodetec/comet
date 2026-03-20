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

export const users = pgTable("users", {
  pubkey: text("pubkey").primaryKey(),
  inviteCodeId: integer("invite_code_id").references(() => inviteCodes.id, {
    onDelete: "set null",
  }),
  storageLimitBytes: bigint("storage_limit_bytes", { mode: "number" }),
  expiresAt: bigint("expires_at", { mode: "number" }),
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
