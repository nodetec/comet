import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as blobDb from "../src/blob-db";
import { computeSha256Hex } from "../src/blob";
import {
  allowStorageForPubkey,
  createAuthHeader,
  createSigner,
  startTestBlossom,
  type BlossomTestContext,
} from "./helpers";

type UploadResponse = {
  url: string;
  sha256: string;
  size: number;
  type: string;
  uploaded: number;
};

let ctx: BlossomTestContext | undefined;

describe("blossom integration", () => {
  beforeEach(async () => {
    ctx = await startTestBlossom();
  });

  afterEach(async () => {
    if (ctx) {
      await ctx.cleanup();
      ctx = undefined;
    }
  });

  test("uploads a blob, persists metadata, and serves GET/HEAD/list", async () => {
    const signer = createSigner();
    await allowStorageForPubkey(ctx!.db, signer.pubkey);

    const body = new TextEncoder().encode("hello blossom");
    const sha256 = await computeSha256Hex(body);
    const uploadResponse = await fetch(`${ctx!.baseUrl}/upload`, {
      method: "PUT",
      headers: {
        Authorization: createAuthHeader(signer, "upload"),
        "Content-Type": "text/plain",
      },
      body,
    });

    expect(uploadResponse.status).toBe(200);

    const uploaded = (await uploadResponse.json()) as UploadResponse;
    expect(uploaded.sha256).toBe(sha256);
    expect(uploaded.url).toBe(`https://cdn.test/blossom/${sha256}`);
    expect(uploaded.size).toBe(body.byteLength);
    expect(uploaded.type).toBe("text/plain");
    expect(ctx!.objectStorage.uploadCount).toBe(1);
    expect(ctx!.objectStorage.blobs.get(sha256)?.contentType).toBe(
      "text/plain",
    );
    expect(ctx!.objectStorage.blobs.get(sha256)?.data).toEqual(body);

    const storedBlob = await blobDb.getBlob(ctx!.db, sha256);
    expect(storedBlob).not.toBeNull();
    expect(storedBlob?.size).toBe(body.byteLength);

    const getResponse = await fetch(`${ctx!.baseUrl}/${sha256}`, {
      redirect: "manual",
    });
    expect(getResponse.status).toBe(302);
    expect(getResponse.headers.get("location")).toBe(
      `https://cdn.test/blossom/${sha256}`,
    );

    const headResponse = await fetch(`${ctx!.baseUrl}/${sha256}`, {
      method: "HEAD",
    });
    expect(headResponse.status).toBe(200);
    expect(headResponse.headers.get("content-length")).toBe(
      String(body.byteLength),
    );
    expect(headResponse.headers.get("content-type")).toBe("text/plain");
    expect(headResponse.headers.get("x-content-sha256")).toBe(sha256);

    const listResponse = await fetch(`${ctx!.baseUrl}/list/${signer.pubkey}`, {
      headers: {
        Authorization: createAuthHeader(signer, "list"),
      },
    });
    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toEqual([
      {
        url: `https://cdn.test/blossom/${sha256}`,
        sha256,
        size: body.byteLength,
        type: "text/plain",
        uploaded: storedBlob?.uploaded_at,
      },
    ]);
  });

  test("serves blob bytes directly when public blob URL points back to the same endpoint", async () => {
    ctx!.objectStorage.publicBaseUrl = ctx!.baseUrl;

    const signer = createSigner();
    await allowStorageForPubkey(ctx!.db, signer.pubkey);

    const body = new TextEncoder().encode("loop-safe blob");
    const sha256 = await computeSha256Hex(body);
    const uploadResponse = await fetch(`${ctx!.baseUrl}/upload`, {
      method: "PUT",
      headers: {
        Authorization: createAuthHeader(signer, "upload"),
        "Content-Type": "text/plain",
      },
      body,
    });

    expect(uploadResponse.status).toBe(200);

    const getResponse = await fetch(`${ctx!.baseUrl}/${sha256}`);
    expect(getResponse.status).toBe(200);
    expect(getResponse.headers.get("content-type")).toBe("text/plain");
    expect(getResponse.headers.get("x-content-sha256")).toBe(sha256);
    expect(Array.from(new Uint8Array(await getResponse.arrayBuffer()))).toEqual(
      Array.from(body),
    );
  });

  test("rejects list requests for a different pubkey", async () => {
    const owner = createSigner();
    const other = createSigner();
    await allowStorageForPubkey(ctx!.db, owner.pubkey);

    const body = new TextEncoder().encode("private list");
    const uploadResponse = await fetch(`${ctx!.baseUrl}/upload`, {
      method: "PUT",
      headers: {
        Authorization: createAuthHeader(owner, "upload"),
        "Content-Type": "text/plain",
      },
      body,
    });
    expect(uploadResponse.status).toBe(200);

    const response = await fetch(`${ctx!.baseUrl}/list/${owner.pubkey}`, {
      headers: {
        Authorization: createAuthHeader(other, "list"),
      },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden" });
  });

  test("keeps shared blobs until the final owner deletes them", async () => {
    const firstOwner = createSigner();
    const secondOwner = createSigner();
    await allowStorageForPubkey(ctx!.db, firstOwner.pubkey);
    await allowStorageForPubkey(ctx!.db, secondOwner.pubkey);

    const body = new TextEncoder().encode("shared blob");
    const sha256 = await computeSha256Hex(body);

    const firstUpload = await fetch(`${ctx!.baseUrl}/upload`, {
      method: "PUT",
      headers: {
        Authorization: createAuthHeader(firstOwner, "upload"),
        "Content-Type": "text/plain",
      },
      body,
    });
    expect(firstUpload.status).toBe(200);

    const secondUpload = await fetch(`${ctx!.baseUrl}/upload`, {
      method: "PUT",
      headers: {
        Authorization: createAuthHeader(secondOwner, "upload"),
        "Content-Type": "text/plain",
      },
      body,
    });
    expect(secondUpload.status).toBe(200);
    expect(ctx!.objectStorage.uploadCount).toBe(1);

    const nonOwner = createSigner();
    const forbiddenDelete = await fetch(`${ctx!.baseUrl}/${sha256}`, {
      method: "DELETE",
      headers: {
        Authorization: createAuthHeader(nonOwner, "delete", { sha256 }),
      },
    });
    expect(forbiddenDelete.status).toBe(403);
    expect(await forbiddenDelete.json()).toEqual({ error: "forbidden" });

    const firstDelete = await fetch(`${ctx!.baseUrl}/${sha256}`, {
      method: "DELETE",
      headers: {
        Authorization: createAuthHeader(firstOwner, "delete", { sha256 }),
      },
    });
    expect(firstDelete.status).toBe(200);
    expect(ctx!.objectStorage.deleteCount).toBe(0);
    expect(await blobDb.getBlob(ctx!.db, sha256)).not.toBeNull();

    const secondDelete = await fetch(`${ctx!.baseUrl}/${sha256}`, {
      method: "DELETE",
      headers: {
        Authorization: createAuthHeader(secondOwner, "delete", { sha256 }),
      },
    });
    expect(secondDelete.status).toBe(200);
    expect(ctx!.objectStorage.deleteCount).toBe(1);
    expect(ctx!.objectStorage.deletedKeys).toEqual([sha256]);
    expect(await blobDb.getBlob(ctx!.db, sha256)).toBeNull();
  });

  test("enforces storage limits before writing blob bytes", async () => {
    const signer = createSigner();
    await allowStorageForPubkey(ctx!.db, signer.pubkey, 4);

    const body = new TextEncoder().encode("too big");
    const response = await fetch(`${ctx!.baseUrl}/upload`, {
      method: "PUT",
      headers: {
        Authorization: createAuthHeader(signer, "upload"),
        "Content-Type": "text/plain",
      },
      body,
    });

    expect(response.status).toBe(507);
    expect(await response.json()).toEqual({
      error: "storage limit exceeded",
      usage: 0,
      limit: 4,
      required: body.byteLength,
    });
    expect(ctx!.objectStorage.uploadCount).toBe(0);
  });

  test("rejects uploads from pubkeys that are not on the allowlist", async () => {
    const signer = createSigner();
    const body = new TextEncoder().encode("not allowlisted");

    const response = await fetch(`${ctx!.baseUrl}/upload`, {
      method: "PUT",
      headers: {
        Authorization: createAuthHeader(signer, "upload"),
        "Content-Type": "text/plain",
      },
      body,
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden" });
    expect(ctx!.objectStorage.uploadCount).toBe(0);
  });
});
