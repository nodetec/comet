import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as blobDb from "../src/blob-db";
import { computeSha256Hex } from "../src/blob";
import {
  createAccessKeyForStorage,
  createAuthHeader,
  createSigner,
  startTestBlossom,
  type BlossomTestContext,
} from "./helpers";

const ADMIN_TOKEN = "test-admin-token";
let ctx: BlossomTestContext | undefined;

describe("DELETE /admin/:sha256", () => {
  beforeEach(async () => {
    process.env.ADMIN_TOKEN = ADMIN_TOKEN;
    ctx = await startTestBlossom();
  });

  afterEach(async () => {
    if (ctx) {
      await ctx.cleanup();
      ctx = undefined;
    }
    delete process.env.ADMIN_TOKEN;
  });

  test("returns 401 without admin token", async () => {
    const fakeSha = "a".repeat(64);
    const res = await fetch(`${ctx!.baseUrl}/admin/${fakeSha}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(401);
  });

  test("returns 401 with wrong token", async () => {
    const fakeSha = "a".repeat(64);
    const res = await fetch(`${ctx!.baseUrl}/admin/${fakeSha}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer wrong-token" },
    });
    expect(res.status).toBe(401);
  });

  test("returns 404 for non-existent blob", async () => {
    const fakeSha = "a".repeat(64);
    const res = await fetch(`${ctx!.baseUrl}/admin/${fakeSha}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    expect(res.status).toBe(404);
  });

  test("purges all blobs for a pubkey while preserving shared blobs", async () => {
    const owner = createSigner();
    const other = createSigner();
    const accessKey = await createAccessKeyForStorage(ctx!.db);

    const sharedBody = new TextEncoder().encode("shared blob");
    const sharedSha = await computeSha256Hex(sharedBody);
    const exclusiveBody = new TextEncoder().encode("exclusive blob");
    const exclusiveSha = await computeSha256Hex(exclusiveBody);

    await fetch(`${ctx!.baseUrl}/upload`, {
      method: "PUT",
      headers: {
        Authorization: createAuthHeader(owner, "upload"),
        "Content-Type": "text/plain",
        "X-Access-Key": accessKey,
      },
      body: sharedBody,
    });
    await fetch(`${ctx!.baseUrl}/upload`, {
      method: "PUT",
      headers: {
        Authorization: createAuthHeader(other, "upload"),
        "Content-Type": "text/plain",
        "X-Access-Key": accessKey,
      },
      body: sharedBody,
    });
    await fetch(`${ctx!.baseUrl}/upload`, {
      method: "PUT",
      headers: {
        Authorization: createAuthHeader(owner, "upload"),
        "Content-Type": "text/plain",
        "X-Access-Key": accessKey,
      },
      body: exclusiveBody,
    });

    const res = await fetch(
      `${ctx!.baseUrl}/admin/users/${owner.pubkey}/blobs`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      pubkey: owner.pubkey,
      processedBlobs: 2,
      deletedBlobs: 1,
      releasedSharedBlobs: 1,
      deletedBytes: exclusiveBody.byteLength,
    });

    expect(ctx!.objectStorage.deletedKeys).toEqual([exclusiveSha]);
    expect(await blobDb.getBlob(ctx!.db, exclusiveSha)).toBeNull();
    expect(await blobDb.getBlob(ctx!.db, sharedSha)).not.toBeNull();
    expect(await blobDb.hasOwner(ctx!.db, sharedSha, owner.pubkey)).toBe(false);
    expect(await blobDb.hasOwner(ctx!.db, sharedSha, other.pubkey)).toBe(true);
  });
});
