DROP INDEX "idx_events_pubkey";--> statement-breakpoint
CREATE INDEX "idx_blob_owners_pubkey" ON "blob_owners" USING btree ("pubkey");--> statement-breakpoint
CREATE INDEX "idx_change_tags_seq" ON "change_tags" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "idx_event_tags_event_id" ON "event_tags" USING btree ("event_id");