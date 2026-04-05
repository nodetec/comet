import { eq } from "drizzle-orm";

import type { SnapshotRelayDb } from "./db";
import type { AllowedUser } from "./types";

import { relayAllowedUsers } from "./storage/schema";

export type AccessControl = {
  privateMode: boolean;
  isAllowed: (pubkey: string) => Promise<boolean>;
  allow: (
    pubkey: string,
    expiresAt: number | null,
    storageLimitBytes?: number | null,
  ) => Promise<void>;
  revoke: (pubkey: string) => Promise<boolean>;
  list: () => Promise<AllowedUser[]>;
};

export function createAccessControl(
  db: SnapshotRelayDb,
  privateMode: boolean,
): AccessControl {
  return {
    privateMode,

    async isAllowed(pubkey) {
      if (!privateMode) {
        return true;
      }

      const rows = await db
        .select({ expiresAt: relayAllowedUsers.expiresAt })
        .from(relayAllowedUsers)
        .where(eq(relayAllowedUsers.pubkey, pubkey))
        .limit(1);

      if (rows.length === 0) {
        return false;
      }

      const expiresAt = rows[0].expiresAt;
      if (expiresAt === null) {
        return true;
      }

      return expiresAt > Math.floor(Date.now() / 1000);
    },

    async allow(pubkey, expiresAt, storageLimitBytes) {
      const createdAt = Math.floor(Date.now() / 1000);
      await db
        .insert(relayAllowedUsers)
        .values({
          pubkey,
          expiresAt,
          storageLimitBytes: storageLimitBytes ?? null,
          createdAt,
        })
        .onConflictDoUpdate({
          target: relayAllowedUsers.pubkey,
          set: {
            expiresAt,
            ...(storageLimitBytes !== undefined ? { storageLimitBytes } : {}),
          },
        });
    },

    async revoke(pubkey) {
      const rows = await db
        .delete(relayAllowedUsers)
        .where(eq(relayAllowedUsers.pubkey, pubkey))
        .returning({ pubkey: relayAllowedUsers.pubkey });

      return rows.length > 0;
    },

    async list() {
      const rows = await db
        .select({
          pubkey: relayAllowedUsers.pubkey,
          expiresAt: relayAllowedUsers.expiresAt,
          storageLimitBytes: relayAllowedUsers.storageLimitBytes,
          createdAt: relayAllowedUsers.createdAt,
        })
        .from(relayAllowedUsers)
        .orderBy(relayAllowedUsers.createdAt);

      return rows.map((row) => ({
        pubkey: row.pubkey,
        expiresAt: row.expiresAt,
        storageLimitBytes: row.storageLimitBytes,
        createdAt: row.createdAt,
      }));
    },
  };
}
