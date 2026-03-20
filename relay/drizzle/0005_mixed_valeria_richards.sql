ALTER TABLE "events" ADD COLUMN "recipient" text;--> statement-breakpoint
UPDATE events SET recipient = (
  SELECT et.tag_value FROM event_tags et
  WHERE et.event_id = events.id AND et.tag_name = 'p'
  LIMIT 1
) WHERE kind = 1059;--> statement-breakpoint
CREATE INDEX "idx_events_recipient" ON "events" USING btree ("recipient");