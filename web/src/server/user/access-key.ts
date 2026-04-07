import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import { assertUser } from "~/server/middleware";
import { accessKeys } from "@comet/data";

export const getUserAccessKey = createServerFn({ method: "GET" }).handler(
  async () => {
    const pubkey = assertUser();

    const rows = await db
      .select({
        key: accessKeys.key,
        label: accessKeys.label,
        storageLimitBytes: accessKeys.storageLimitBytes,
        expiresAt: accessKeys.expiresAt,
        revoked: accessKeys.revoked,
      })
      .from(accessKeys)
      .where(eq(accessKeys.pubkey, pubkey))
      .limit(1);

    if (rows.length === 0) {
      return { accessKey: null };
    }

    const row = rows[0];
    return {
      accessKey: {
        key: row.key,
        label: row.label,
        storageLimitBytes: row.storageLimitBytes,
        expiresAt: row.expiresAt,
        revoked: row.revoked,
      },
    };
  },
);
