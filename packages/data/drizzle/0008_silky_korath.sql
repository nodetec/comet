DROP INDEX "idx_events_kind";--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "first_seen" bigint DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT) NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_events_kind_created_at" ON "events" USING btree ("kind","created_at");