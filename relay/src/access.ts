import { eq } from "drizzle-orm";

import type { SnapshotRelayDb } from "./db";
import type { AccessKey } from "./types";

import { accessKeys } from "./storage/schema";

export type AccessControl = {
  privateMode: boolean;
  validateKey: (
    key: string,
  ) => Promise<{ valid: boolean; storageLimitBytes?: number | null }>;
  createKey: (
    key: string,
    label: string | null,
    pubkey: string | null,
    expiresAt: number | null,
    storageLimitBytes: number | null,
  ) => Promise<void>;
  revokeKey: (key: string) => Promise<boolean>;
  deleteKey: (key: string) => Promise<boolean>;
  listKeys: () => Promise<AccessKey[]>;
};

export function createAccessControl(
  db: SnapshotRelayDb,
  privateMode: boolean,
): AccessControl {
  return {
    privateMode,

    async validateKey(key) {
      if (!privateMode) {
        return { valid: true };
      }

      const rows = await db
        .select({
          expiresAt: accessKeys.expiresAt,
          revoked: accessKeys.revoked,
          storageLimitBytes: accessKeys.storageLimitBytes,
        })
        .from(accessKeys)
        .where(eq(accessKeys.key, key))
        .limit(1);

      if (rows.length === 0) {
        return { valid: false };
      }

      const row = rows[0];

      if (row.revoked) {
        return { valid: false };
      }

      if (row.expiresAt !== null) {
        const now = Math.floor(Date.now() / 1000);
        if (row.expiresAt <= now) {
          return { valid: false };
        }
      }

      return { valid: true, storageLimitBytes: row.storageLimitBytes };
    },

    async createKey(key, label, pubkey, expiresAt, storageLimitBytes) {
      const createdAt = Math.floor(Date.now() / 1000);
      await db
        .insert(accessKeys)
        .values({
          key,
          label,
          pubkey,
          expiresAt,
          storageLimitBytes,
          createdAt,
        })
        .onConflictDoUpdate({
          target: accessKeys.key,
          set: {
            label,
            pubkey,
            expiresAt,
            storageLimitBytes,
          },
        });
    },

    async revokeKey(key) {
      const rows = await db
        .update(accessKeys)
        .set({ revoked: true })
        .where(eq(accessKeys.key, key))
        .returning({ key: accessKeys.key });

      return rows.length > 0;
    },

    async deleteKey(key) {
      const rows = await db
        .delete(accessKeys)
        .where(eq(accessKeys.key, key))
        .returning({ key: accessKeys.key });

      return rows.length > 0;
    },

    async listKeys() {
      const rows = await db
        .select({
          key: accessKeys.key,
          label: accessKeys.label,
          pubkey: accessKeys.pubkey,
          storageLimitBytes: accessKeys.storageLimitBytes,
          expiresAt: accessKeys.expiresAt,
          revoked: accessKeys.revoked,
          createdAt: accessKeys.createdAt,
        })
        .from(accessKeys)
        .orderBy(accessKeys.createdAt);

      return rows;
    },
  };
}
