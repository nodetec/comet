import { and, eq, sql } from "drizzle-orm";
import type { DB } from "./db";
import { users, inviteCodes } from "./schema";

export interface AccessControl {
  isAllowed(pubkey: string): boolean;
  allow(
    pubkey: string,
    expiresAt: number | null,
    storageLimitBytes?: number | null,
  ): Promise<void>;
  revoke(pubkey: string): Promise<boolean>;
  list(): Promise<
    Array<{
      pubkey: string;
      expires_at: number | null;
      storage_limit_bytes: number | null;
    }>
  >;
  setStorageLimit(pubkey: string, limitBytes: number | null): Promise<void>;
  registerWithInviteCode(
    pubkey: string,
    code: string,
  ): Promise<{ ok: boolean; error?: string }>;
  readonly privateMode: boolean;
}

function generateCode(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export { generateCode };

export async function initAccessControl(
  db: DB,
  privateMode: boolean,
): Promise<AccessControl> {
  const allowedSet = new Map<string, number | null>();
  if (privateMode) {
    const rows = await db
      .select({ pubkey: users.pubkey, expiresAt: users.expiresAt })
      .from(users);
    for (const row of rows) {
      allowedSet.set(row.pubkey, row.expiresAt);
    }
  }

  function isAllowed(pubkey: string): boolean {
    if (!privateMode) return true;
    const expiresAt = allowedSet.get(pubkey);
    if (expiresAt === undefined) return false;
    if (expiresAt === null) return true;
    return expiresAt > Math.floor(Date.now() / 1000);
  }

  async function allow(
    pubkey: string,
    expiresAt: number | null,
    storageLimitBytes?: number | null,
  ): Promise<void> {
    const set: Record<string, unknown> = { expiresAt };
    if (storageLimitBytes !== undefined) {
      set.storageLimitBytes = storageLimitBytes;
    }
    await db
      .insert(users)
      .values({
        pubkey,
        expiresAt,
        storageLimitBytes: storageLimitBytes ?? null,
      })
      .onConflictDoUpdate({ target: users.pubkey, set });
    allowedSet.set(pubkey, expiresAt);
  }

  async function revoke(pubkey: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.pubkey, pubkey));
    allowedSet.delete(pubkey);
    return (result as any).count > 0;
  }

  async function list(): Promise<
    Array<{
      pubkey: string;
      expires_at: number | null;
      storage_limit_bytes: number | null;
    }>
  > {
    const rows = await db
      .select({
        pubkey: users.pubkey,
        expiresAt: users.expiresAt,
        storageLimitBytes: users.storageLimitBytes,
      })
      .from(users)
      .orderBy(users.createdAt);
    return rows.map((r) => ({
      pubkey: r.pubkey,
      expires_at: r.expiresAt,
      storage_limit_bytes: r.storageLimitBytes,
    }));
  }

  async function setStorageLimit(
    pubkey: string,
    limitBytes: number | null,
  ): Promise<void> {
    await db
      .update(users)
      .set({ storageLimitBytes: limitBytes })
      .where(eq(users.pubkey, pubkey));
  }

  async function registerWithInviteCode(
    pubkey: string,
    code: string,
  ): Promise<{ ok: boolean; error?: string }> {
    // Check if pubkey already registered
    const [existing] = await db
      .select({ pubkey: users.pubkey })
      .from(users)
      .where(eq(users.pubkey, pubkey));
    if (existing) {
      return { ok: false, error: "pubkey already registered" };
    }

    // Atomically validate, increment use count, and create user
    const result = await db.transaction(async (tx) => {
      // Conditionally increment use_count only if the code is still valid
      const now = Math.floor(Date.now() / 1000);
      const [updated] = await tx
        .update(inviteCodes)
        .set({ useCount: sql`${inviteCodes.useCount} + 1` })
        .where(
          and(
            eq(inviteCodes.code, code),
            eq(inviteCodes.revoked, false),
            sql`${inviteCodes.useCount} < ${inviteCodes.maxUses}`,
            sql`(${inviteCodes.expiresAt} IS NULL OR ${inviteCodes.expiresAt} > ${now})`,
          ),
        )
        .returning({ id: inviteCodes.id });

      if (!updated) {
        return { ok: false as const, error: "invalid or expired invite code" };
      }

      await tx.insert(users).values({ pubkey, inviteCodeId: updated.id });
      return { ok: true as const, id: updated.id };
    });

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    allowedSet.set(pubkey, null);
    return { ok: true };
  }

  return {
    isAllowed,
    allow,
    revoke,
    list,
    setStorageLimit,
    registerWithInviteCode,
    privateMode,
  };
}
