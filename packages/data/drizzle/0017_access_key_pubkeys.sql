CREATE TABLE "access_key_pubkeys" (
	"access_key" text NOT NULL REFERENCES "access_keys"("key") ON DELETE CASCADE,
	"pubkey" text NOT NULL,
	"first_seen" bigint NOT NULL,
	"last_seen" bigint NOT NULL,
	PRIMARY KEY ("access_key", "pubkey")
);

CREATE INDEX "idx_access_key_pubkeys_pubkey" ON "access_key_pubkeys" USING btree ("pubkey");
