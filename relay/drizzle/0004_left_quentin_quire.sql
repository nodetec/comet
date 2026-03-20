ALTER TABLE "users" DROP CONSTRAINT "users_invite_code_id_invite_codes_id_fk";
--> statement-breakpoint
ALTER TABLE "blob_owners" ALTER COLUMN "created_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "blob_owners" ALTER COLUMN "created_at" SET DATA TYPE bigint USING (EXTRACT(EPOCH FROM "created_at")::BIGINT);
--> statement-breakpoint
ALTER TABLE "blob_owners" ALTER COLUMN "created_at" SET DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT);
--> statement-breakpoint
ALTER TABLE "blobs" ALTER COLUMN "uploaded_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "blobs" ALTER COLUMN "uploaded_at" SET DATA TYPE bigint USING (EXTRACT(EPOCH FROM "uploaded_at")::BIGINT);
--> statement-breakpoint
ALTER TABLE "blobs" ALTER COLUMN "uploaded_at" SET DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_invite_code_id_invite_codes_id_fk" FOREIGN KEY ("invite_code_id") REFERENCES "public"."invite_codes"("id") ON DELETE set null ON UPDATE no action;
