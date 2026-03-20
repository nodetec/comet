CREATE TABLE "allowed_pubkeys" (
	"pubkey" text PRIMARY KEY NOT NULL,
	"expires_at" bigint,
	"created_at" bigint DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blob_owners" (
	"sha256" text NOT NULL,
	"pubkey" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blob_owners_sha256_pubkey_pk" PRIMARY KEY("sha256","pubkey")
);
--> statement-breakpoint
CREATE TABLE "blobs" (
	"sha256" text PRIMARY KEY NOT NULL,
	"size" bigint NOT NULL,
	"type" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_tags" (
	"seq" bigint NOT NULL,
	"tag_name" text NOT NULL,
	"tag_value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "changes" (
	"seq" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "changes_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"kind" integer NOT NULL,
	"pubkey" text NOT NULL,
	"reason" text,
	"tags" jsonb
);
--> statement-breakpoint
CREATE TABLE "deleted_coords" (
	"kind" integer NOT NULL,
	"pubkey" text NOT NULL,
	"d_tag" text NOT NULL,
	"deleted_up_to" bigint NOT NULL,
	"deletion_id" text NOT NULL,
	CONSTRAINT "deleted_coords_kind_pubkey_d_tag_pk" PRIMARY KEY("kind","pubkey","d_tag")
);
--> statement-breakpoint
CREATE TABLE "deleted_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"deletion_id" text NOT NULL,
	"pubkey" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_tags" (
	"event_id" text NOT NULL,
	"tag_name" text NOT NULL,
	"tag_value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"pubkey" text NOT NULL,
	"created_at" bigint NOT NULL,
	"kind" integer NOT NULL,
	"tags" jsonb NOT NULL,
	"content" text NOT NULL,
	"sig" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blob_owners" ADD CONSTRAINT "blob_owners_sha256_blobs_sha256_fk" FOREIGN KEY ("sha256") REFERENCES "public"."blobs"("sha256") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_tags" ADD CONSTRAINT "change_tags_seq_changes_seq_fk" FOREIGN KEY ("seq") REFERENCES "public"."changes"("seq") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_tags" ADD CONSTRAINT "event_tags_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_change_tags_lookup" ON "change_tags" USING btree ("tag_name","tag_value");--> statement-breakpoint
CREATE INDEX "idx_changes_kind" ON "changes" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "idx_changes_pubkey" ON "changes" USING btree ("pubkey");--> statement-breakpoint
CREATE INDEX "idx_tags_lookup" ON "event_tags" USING btree ("tag_name","tag_value");--> statement-breakpoint
CREATE INDEX "idx_events_pubkey" ON "events" USING btree ("pubkey");--> statement-breakpoint
CREATE INDEX "idx_events_kind" ON "events" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "idx_events_created_at" ON "events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_events_pubkey_kind" ON "events" USING btree ("pubkey","kind");