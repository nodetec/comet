ALTER TABLE "access_keys" ADD COLUMN "pubkey" text;

CREATE INDEX "idx_access_keys_pubkey" ON "access_keys" USING btree ("pubkey");
