-- Destructive sync-schema reset to align existing relay databases with the
-- current snapshot-sync model. This intentionally drops all sync state.

DROP TABLE IF EXISTS "sync_heads";
--> statement-breakpoint
DROP TABLE IF EXISTS "sync_revision_parents";
--> statement-breakpoint
DROP TABLE IF EXISTS "sync_revisions";
--> statement-breakpoint
DROP TABLE IF EXISTS "sync_change_tags";
--> statement-breakpoint
DROP TABLE IF EXISTS "sync_changes";
--> statement-breakpoint
DROP TABLE IF EXISTS "sync_payloads";
--> statement-breakpoint
DROP TABLE IF EXISTS "sync_snapshots";
--> statement-breakpoint

CREATE TABLE "sync_snapshots" (
	"author_pubkey" text NOT NULL,
	"d_tag" text NOT NULL,
	"snapshot_id" text NOT NULL,
	"op" text NOT NULL,
	"mtime" bigint NOT NULL,
	"entity_type" text,
	"event_id" text,
	"payload_retained" integer DEFAULT 1 NOT NULL,
	"stored_seq" bigint,
	"created_at" bigint NOT NULL,
	CONSTRAINT "sync_snapshots_author_pubkey_d_tag_snapshot_id_pk" PRIMARY KEY("author_pubkey","d_tag","snapshot_id")
);
--> statement-breakpoint
CREATE TABLE "sync_payloads" (
	"event_id" text PRIMARY KEY NOT NULL,
	"author_pubkey" text NOT NULL,
	"d_tag" text NOT NULL,
	"snapshot_id" text NOT NULL,
	"pubkey" text NOT NULL,
	"kind" integer NOT NULL,
	"created_at" bigint NOT NULL,
	"tags" jsonb NOT NULL,
	"content" text NOT NULL,
	"sig" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_changes" (
	"seq" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sync_changes_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"author_pubkey" text NOT NULL,
	"d_tag" text NOT NULL,
	"snapshot_id" text NOT NULL,
	"event_id" text NOT NULL,
	"op" text NOT NULL,
	"mtime" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_sync_snapshots_scope" ON "sync_snapshots" USING btree ("author_pubkey","d_tag");
--> statement-breakpoint
CREATE INDEX "idx_sync_snapshots_snapshot_id" ON "sync_snapshots" USING btree ("snapshot_id");
--> statement-breakpoint
CREATE INDEX "idx_sync_snapshots_mtime" ON "sync_snapshots" USING btree ("mtime");
--> statement-breakpoint
CREATE INDEX "idx_sync_snapshots_entity_type" ON "sync_snapshots" USING btree ("entity_type");
--> statement-breakpoint
CREATE INDEX "idx_sync_payloads_snapshot_id" ON "sync_payloads" USING btree ("author_pubkey","d_tag","snapshot_id");
--> statement-breakpoint
CREATE INDEX "idx_sync_changes_seq" ON "sync_changes" USING btree ("seq");
--> statement-breakpoint
CREATE INDEX "idx_sync_changes_scope_seq" ON "sync_changes" USING btree ("author_pubkey","seq");
--> statement-breakpoint
CREATE INDEX "idx_sync_changes_document_seq" ON "sync_changes" USING btree ("author_pubkey","d_tag","seq");
