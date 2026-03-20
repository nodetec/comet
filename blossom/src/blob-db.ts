import { count, desc, eq, sql } from "drizzle-orm";
import { blobs, blobOwners, users } from "@comet/data";
import type { DB } from "./db";

export const DEFAULT_STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024;

export type BlobRecord = {
  sha256: string;
  size: number;
  type: string | null;
  uploaded_at: number;
};

export type RemoveOwnerResult = "not_owner" | "removed" | "removed_last_owner";

export async function insertBlob(
  db: DB,
  sha256: string,
  size: number,
  type: string | null,
  pubkey: string,
): Promise<void> {
  await db.insert(blobs).values({ sha256, size, type }).onConflictDoNothing();
  await db.insert(blobOwners).values({ sha256, pubkey }).onConflictDoNothing();
}

export async function getBlob(
  db: DB,
  sha256: string,
): Promise<BlobRecord | null> {
  const rows = await db
    .select({
      sha256: blobs.sha256,
      size: blobs.size,
      type: blobs.type,
      uploadedAt: blobs.uploadedAt,
    })
    .from(blobs)
    .where(eq(blobs.sha256, sha256))
    .limit(1);

  if (rows.length === 0) {
    return null;
  }

  return {
    sha256: rows[0].sha256,
    size: rows[0].size,
    type: rows[0].type,
    uploaded_at: rows[0].uploadedAt,
  };
}

export async function hasOwner(
  db: DB,
  sha256: string,
  pubkey: string,
): Promise<boolean> {
  const rows = await db
    .select({ sha256: blobOwners.sha256 })
    .from(blobOwners)
    .where(
      sql`${blobOwners.sha256} = ${sha256} AND ${blobOwners.pubkey} = ${pubkey}`,
    )
    .limit(1);
  return rows.length > 0;
}

export async function listBlobsByPubkey(
  db: DB,
  pubkey: string,
): Promise<BlobRecord[]> {
  const rows = await db
    .select({
      sha256: blobs.sha256,
      size: blobs.size,
      type: blobs.type,
      uploadedAt: blobs.uploadedAt,
    })
    .from(blobs)
    .innerJoin(blobOwners, eq(blobs.sha256, blobOwners.sha256))
    .where(eq(blobOwners.pubkey, pubkey))
    .orderBy(desc(blobs.uploadedAt));

  return rows.map((row) => ({
    sha256: row.sha256,
    size: row.size,
    type: row.type,
    uploaded_at: row.uploadedAt,
  }));
}

export async function removeOwner(
  db: DB,
  sha256: string,
  pubkey: string,
): Promise<RemoveOwnerResult> {
  const deletedRows = await db
    .delete(blobOwners)
    .where(
      sql`${blobOwners.sha256} = ${sha256} AND ${blobOwners.pubkey} = ${pubkey}`,
    )
    .returning({ sha256: blobOwners.sha256 });

  if (deletedRows.length === 0) {
    return "not_owner";
  }

  const remainingRows = await db
    .select({ sha256: blobOwners.sha256 })
    .from(blobOwners)
    .where(eq(blobOwners.sha256, sha256))
    .limit(1);

  return remainingRows.length === 0 ? "removed_last_owner" : "removed";
}

export async function deleteBlob(db: DB, sha256: string): Promise<void> {
  await db.delete(blobs).where(eq(blobs.sha256, sha256));
}

export async function getBlobCount(db: DB): Promise<number> {
  const rows = await db.select({ value: count() }).from(blobs);
  return Number(rows[0]?.value ?? 0);
}

export async function getBlobTotalSizeByPubkey(
  db: DB,
  pubkey: string,
): Promise<number> {
  const rows = await db
    .select({ value: sql<number>`COALESCE(SUM(${blobs.size}), 0)` })
    .from(blobs)
    .innerJoin(blobOwners, eq(blobs.sha256, blobOwners.sha256))
    .where(eq(blobOwners.pubkey, pubkey));

  return Number(rows[0]?.value ?? 0);
}

export async function getStorageLimitForPubkey(
  db: DB,
  pubkey: string,
): Promise<number> {
  const rows = await db
    .select({ storageLimitBytes: users.storageLimitBytes })
    .from(users)
    .where(eq(users.pubkey, pubkey))
    .limit(1);

  return rows[0]?.storageLimitBytes ?? DEFAULT_STORAGE_LIMIT_BYTES;
}
