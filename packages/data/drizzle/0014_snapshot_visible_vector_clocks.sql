ALTER TABLE "sync_snapshots"
ADD COLUMN "vector_clock" jsonb NOT NULL DEFAULT '{}'::jsonb;
