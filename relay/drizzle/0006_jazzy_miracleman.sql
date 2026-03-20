ALTER TABLE "events" ADD COLUMN "d_tag" text;--> statement-breakpoint
UPDATE events SET d_tag = (
  SELECT et.tag_value FROM event_tags et
  WHERE et.event_id = events.id AND et.tag_name = 'd'
  LIMIT 1
) WHERE EXISTS (
  SELECT 1 FROM event_tags et
  WHERE et.event_id = events.id AND et.tag_name = 'd'
);
