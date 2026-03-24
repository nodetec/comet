CREATE TABLE IF NOT EXISTS "relay_events" (
	"id" text PRIMARY KEY NOT NULL,
	"pubkey" text NOT NULL,
	"kind" integer NOT NULL,
	"created_at" bigint NOT NULL,
	"tags" jsonb NOT NULL,
	"content" text NOT NULL,
	"sig" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "relay_event_tags" (
	"event_id" text NOT NULL,
	"tag_name" text NOT NULL,
	"tag_value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_revisions" (
	"recipient" text NOT NULL,
	"d_tag" text NOT NULL,
	"rev" text NOT NULL,
	"op" text NOT NULL,
	"mtime" bigint NOT NULL,
	"entity_type" text,
	"payload_event_id" text,
	"payload_retained" integer DEFAULT 1 NOT NULL,
	"stored_seq" bigint,
	"created_at" bigint NOT NULL,
	CONSTRAINT "sync_revisions_recipient_d_tag_rev_pk" PRIMARY KEY("recipient","d_tag","rev")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_revision_parents" (
	"recipient" text NOT NULL,
	"d_tag" text NOT NULL,
	"rev" text NOT NULL,
	"parent_rev" text NOT NULL,
	CONSTRAINT "sync_revision_parents_recipient_d_tag_rev_parent_rev_pk" PRIMARY KEY("recipient","d_tag","rev","parent_rev")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_heads" (
	"recipient" text NOT NULL,
	"d_tag" text NOT NULL,
	"rev" text NOT NULL,
	"op" text NOT NULL,
	"mtime" bigint NOT NULL,
	CONSTRAINT "sync_heads_recipient_d_tag_rev_pk" PRIMARY KEY("recipient","d_tag","rev")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_payloads" (
	"event_id" text PRIMARY KEY NOT NULL,
	"recipient" text NOT NULL,
	"d_tag" text NOT NULL,
	"rev" text NOT NULL,
	"pubkey" text NOT NULL,
	"kind" integer NOT NULL,
	"created_at" bigint NOT NULL,
	"tags" jsonb NOT NULL,
	"content" text NOT NULL,
	"sig" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_changes" (
	"seq" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sync_changes_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"recipient" text NOT NULL,
	"d_tag" text NOT NULL,
	"rev" text NOT NULL,
	"event_id" text NOT NULL,
	"op" text NOT NULL,
	"mtime" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_change_tags" (
	"seq" bigint NOT NULL,
	"tag_name" text NOT NULL,
	"tag_value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "relay_settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"payload_retention_days" integer,
	"compaction_interval_seconds" integer DEFAULT 300 NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "relay_allowed_users" (
	"pubkey" text PRIMARY KEY NOT NULL,
	"expires_at" bigint,
	"storage_limit_bytes" bigint,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "relay_event_tags" ADD CONSTRAINT "relay_event_tags_event_id_relay_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."relay_events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sync_change_tags" ADD CONSTRAINT "sync_change_tags_seq_sync_changes_seq_fk" FOREIGN KEY ("seq") REFERENCES "public"."sync_changes"("seq") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_relay_events_kind_created_at" ON "relay_events" USING btree ("kind","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_relay_event_tags_lookup" ON "relay_event_tags" USING btree ("tag_name","tag_value");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sync_revisions_scope" ON "sync_revisions" USING btree ("recipient","d_tag");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sync_revisions_rev" ON "sync_revisions" USING btree ("rev");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sync_revisions_mtime" ON "sync_revisions" USING btree ("mtime");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sync_revision_parents_rev" ON "sync_revision_parents" USING btree ("recipient","d_tag","rev");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sync_revision_parents_parent_rev" ON "sync_revision_parents" USING btree ("recipient","d_tag","parent_rev");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sync_heads_scope" ON "sync_heads" USING btree ("recipient","d_tag");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sync_heads_mtime" ON "sync_heads" USING btree ("mtime");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sync_payloads_rev" ON "sync_payloads" USING btree ("recipient","d_tag","rev");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sync_changes_seq" ON "sync_changes" USING btree ("seq");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sync_changes_scope_seq" ON "sync_changes" USING btree ("recipient","seq");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sync_changes_document_seq" ON "sync_changes" USING btree ("recipient","d_tag","seq");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sync_change_tags_lookup" ON "sync_change_tags" USING btree ("tag_name","tag_value");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_relay_allowed_users_created_at" ON "relay_allowed_users" USING btree ("created_at");
--> statement-breakpoint
