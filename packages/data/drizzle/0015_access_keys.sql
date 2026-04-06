CREATE TABLE "access_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text,
	"storage_limit_bytes" bigint,
	"expires_at" bigint,
	"revoked" boolean DEFAULT false NOT NULL,
	"created_at" bigint NOT NULL
);

CREATE INDEX "idx_access_keys_created_at" ON "access_keys" USING btree ("created_at");

ALTER TABLE "blob_owners" ADD COLUMN "access_key" text;

CREATE INDEX "idx_blob_owners_access_key" ON "blob_owners" USING btree ("access_key");

DROP TABLE "relay_allowed_users";
