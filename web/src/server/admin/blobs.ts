import { createServerFn } from "@tanstack/react-start";
import { desc, inArray, lt } from "drizzle-orm";
import { db } from "~/server/db";
import { assertAdmin } from "~/server/middleware";
import { blobs, blobOwners } from "@comet/data";
import { getAdminErrorMessage } from "~/server/admin/http";

export const listBlobs = createServerFn({ method: "GET" })
  .inputValidator((data: { cursor?: string }) => data)
  .handler(async ({ data }) => {
    assertAdmin();
    const limit = 50;

    let blobQuery = db
      .select({
        sha256: blobs.sha256,
        size: blobs.size,
        type: blobs.type,
        uploadedAt: blobs.uploadedAt,
      })
      .from(blobs)
      .$dynamic();

    if (data.cursor) {
      blobQuery = blobQuery.where(lt(blobs.uploadedAt, Number(data.cursor)));
    }

    const blobRows = await blobQuery
      .orderBy(desc(blobs.uploadedAt))
      .limit(limit);

    if (blobRows.length === 0) {
      return { blobs: [], nextCursor: undefined };
    }

    const hashes = blobRows.map((r) => r.sha256);
    const ownerRows = await db
      .select({ sha256: blobOwners.sha256, pubkey: blobOwners.pubkey })
      .from(blobOwners)
      .where(inArray(blobOwners.sha256, hashes));

    const ownerMap = new Map<string, string[]>();
    for (const r of ownerRows) {
      const list = ownerMap.get(r.sha256) ?? [];
      list.push(r.pubkey);
      ownerMap.set(r.sha256, list);
    }

    const items = blobRows.map((r) => ({
      sha256: r.sha256,
      size: r.size,
      type: r.type,
      uploadedAt: r.uploadedAt,
      owners: ownerMap.get(r.sha256) ?? [],
    }));

    const nextCursor =
      items.length === limit
        ? String(items[items.length - 1].uploadedAt)
        : undefined;

    return { blobs: items, nextCursor };
  });

export const deleteBlob = createServerFn({ method: "POST" })
  .inputValidator((data: { sha256: string }) => data)
  .handler(async ({ data }) => {
    assertAdmin();
    if (!data.sha256 || !/^[a-f0-9]{64}$/.test(data.sha256)) {
      throw new Error("invalid sha256");
    }

    const blossomUrl = process.env.BLOSSOM_URL;
    const adminToken = process.env.ADMIN_TOKEN;
    if (!blossomUrl || !adminToken) {
      throw new Error("BLOSSOM_URL or ADMIN_TOKEN not configured");
    }

    const res = await fetch(`${blossomUrl}/admin/${data.sha256}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    if (!res.ok) {
      const reason = await getAdminErrorMessage(res);
      throw new Error(`Blossom delete failed: ${reason}`);
    }

    return { deleted: true as const };
  });
