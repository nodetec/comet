CREATE TABLE "invite_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"max_uses" integer DEFAULT 1 NOT NULL,
	"use_count" integer DEFAULT 0 NOT NULL,
	"expires_at" bigint,
	"revoked" boolean DEFAULT false NOT NULL,
	"created_at" bigint DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT) NOT NULL,
	CONSTRAINT "invite_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"pubkey" text PRIMARY KEY NOT NULL,
	"invite_code_id" integer,
	"storage_limit_bytes" bigint,
	"expires_at" bigint,
	"created_at" bigint DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT) NOT NULL
);
--> statement-breakpoint
INSERT INTO "users" ("pubkey", "storage_limit_bytes", "expires_at", "created_at")
SELECT "pubkey", "storage_limit_bytes", "expires_at", "created_at" FROM "allowed_pubkeys";
--> statement-breakpoint
DROP TABLE "allowed_pubkeys" CASCADE;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_invite_code_id_invite_codes_id_fk" FOREIGN KEY ("invite_code_id") REFERENCES "public"."invite_codes"("id") ON DELETE no action ON UPDATE no action;