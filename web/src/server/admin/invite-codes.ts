import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { db } from "~/server/db";
import { assertAdmin } from "~/server/middleware";
import { inviteCodes } from "@comet/data";

function generateCode(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export const listInviteCodes = createServerFn({ method: "GET" }).handler(
  async () => {
    assertAdmin();
    const rows = await db
      .select()
      .from(inviteCodes)
      .orderBy(desc(inviteCodes.createdAt));
    return {
      inviteCodes: rows.map((r) => ({
        id: r.id,
        code: r.code,
        maxUses: r.maxUses,
        useCount: r.useCount,
        expiresAt: r.expiresAt,
        revoked: r.revoked,
        createdAt: r.createdAt,
      })),
    };
  },
);

export const createInviteCode = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { maxUses?: number; expiresAt?: number | null }) => data,
  )
  .handler(async ({ data }) => {
    assertAdmin();
    const code = generateCode();
    const maxUses = data.maxUses ?? 1;
    const expiresAt = data.expiresAt ?? null;
    const [row] = await db
      .insert(inviteCodes)
      .values({ code, maxUses, expiresAt })
      .returning();
    return {
      id: row.id,
      code: row.code,
      maxUses: row.maxUses,
      useCount: row.useCount,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
    };
  });

export const revokeInviteCode = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    assertAdmin();
    await db
      .update(inviteCodes)
      .set({ revoked: true })
      .where(eq(inviteCodes.id, data.id));
    return { revoked: true as const };
  });
