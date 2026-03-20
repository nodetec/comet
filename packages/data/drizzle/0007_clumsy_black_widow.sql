DROP INDEX "idx_events_pubkey_kind";--> statement-breakpoint
CREATE INDEX "idx_events_pubkey_kind_dtag" ON "events" USING btree ("pubkey","kind","d_tag");