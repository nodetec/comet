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

type UploadResponse = {
  url: string;
  sha256: string;
  size: number;
  type: string;
  uploaded: number;
};

type UploadBatchResponse = {
  results: Array<{
    part: string;
    status: number;
    descriptor?: UploadResponse;
    error?: string;
  }>;
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
    const accessKey = await createAccessKeyForStorage(ctx!.db);

    const body = new TextEncoder().encode("hello blossom");
    const sha256 = await computeSha256Hex(body);
    const uploadResponse = await fetch(`${ctx!.baseUrl}/upload`, {
      method: "PUT",
      headers: {
        Authorization: createAuthHeader(signer, "upload"),
        "Content-Type": "text/plain",
        "X-Access-Key": accessKey,
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
        "X-Access-Key": accessKey,
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
    const accessKey = await createAccessKeyForStorage(ctx!.db);

    const body = new TextEncoder().encode("loop-safe blob");
    const sha256 = await computeSha256Hex(body);
    const uploadResponse = await fetch(`${ctx!.baseUrl}/upload`, {
      method: "PUT",
      headers: {
        Authorization: createAuthHeader(signer, "upload"),
        "Content-Type": "text/plain",
        "X-Access-Key": accessKey,
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

  test("proxies authenticated blob downloads even when public blob URL points elsewhere", async () => {
    const signer = createSigner();
    const accessKey = await createAccessKeyForStorage(ctx!.db);

    const body = new TextEncoder().encode("authenticated proxy blob");
    const sha256 = await computeSha256Hex(body);
    const uploadResponse = await fetch(`${ctx!.baseUrl}/upload`, {
      method: "PUT",
      headers: {
        Authorization: createAuthHeader(signer, "upload"),
        "Content-Type": "text/plain",
        "X-Access-Key": accessKey,
      },
      body,
    });

    expect(uploadResponse.status).toBe(200);

    const getResponse = await fetch(`${ctx!.baseUrl}/${sha256}`, {
      headers: {
        Authorization: createAuthHeader(signer, "upload", { sha256 }),
      },
      redirect: "manual",
    });

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
    const accessKey = await createAccessKeyForStorage(ctx!.db);

    const body = new TextEncoder().encode("private list");
    const uploadResponse = await fetch(`${ctx!.baseUrl}/upload`, {
      method: "PUT",
      headers: {
        Authorization: createAuthHeader(owner, "upload"),
        "Content-Type": "text/plain",
        "X-Access-Key": accessKey,
      },
      body,
    });
    expect(uploadResponse.status).toBe(200);

    const response = await fetch(`${ctx!.baseUrl}/list/${owner.pubkey}`, {
      headers: {
        Authorization: createAuthHeader(other, "list"),
        "X-Access-Key": accessKey,
      },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden" });
  });

  test("keeps shared blobs until the final owner deletes them", async () => {
    const firstOwner = createSigner();
    const secondOwner = createSigner();
    const accessKey = await createAccessKeyForStorage(ctx!.db);

    const body = new TextEncoder().encode("shared blob");
    const sha256 = await computeSha256Hex(body);

    const firstUpload = await fetch(`${ctx!.baseUrl}/upload`, {
      method: "PUT",
      headers: {
        Authorization: createAuthHeader(firstOwner, "upload"),
        "Content-Type": "text/plain",
        "X-Access-Key": accessKey,
      },
      body,
    });
    expect(firstUpload.status).toBe(200);

    const secondUpload = await fetch(`${ctx!.baseUrl}/upload`, {
      method: "PUT",
      headers: {
        Authorization: createAuthHeader(secondOwner, "upload"),
        "Content-Type": "text/plain",
        "X-Access-Key": accessKey,
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
        "X-Access-Key": accessKey,
      },
    });
    expect(forbiddenDelete.status).toBe(403);
    expect(await forbiddenDelete.json()).toEqual({ error: "forbidden" });

    const firstDelete = await fetch(`${ctx!.baseUrl}/${sha256}`, {
      method: "DELETE",
      headers: {
        Authorization: createAuthHeader(firstOwner, "delete", { sha256 }),
        "X-Access-Key": accessKey,
      },
    });
    expect(firstDelete.status).toBe(200);
    expect(ctx!.objectStorage.deleteCount).toBe(0);
    expect(await blobDb.getBlob(ctx!.db, sha256)).not.toBeNull();

    const secondDelete = await fetch(`${ctx!.baseUrl}/${sha256}`, {
      method: "DELETE",
      headers: {
        Authorization: createAuthHeader(secondOwner, "delete", { sha256 }),
        "X-Access-Key": accessKey,
      },
    });
    expect(secondDelete.status).toBe(200);
    expect(ctx!.objectStorage.deleteCount).toBe(1);
    expect(ctx!.objectStorage.deletedKeys).toEqual([sha256]);
    expect(await blobDb.getBlob(ctx!.db, sha256)).toBeNull();
  });

  test("enforces storage limits before writing blob bytes", async () => {
    const signer = createSigner();
    const accessKey = await createAccessKeyForStorage(ctx!.db, 4);

    const body = new TextEncoder().encode("too big");
    const response = await fetch(`${ctx!.baseUrl}/upload`, {
      method: "PUT",
      headers: {
        Authorization: createAuthHeader(signer, "upload"),
        "Content-Type": "text/plain",
        "X-Access-Key": accessKey,
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

  test("rejects uploads without an access key", async () => {
    const signer = createSigner();
    const body = new TextEncoder().encode("no key");

    const response = await fetch(`${ctx!.baseUrl}/upload`, {
      method: "PUT",
      headers: {
        Authorization: createAuthHeader(signer, "upload"),
        "Content-Type": "text/plain",
      },
      body,
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "access key required" });
    expect(ctx!.objectStorage.uploadCount).toBe(0);
  });

  test("rejects uploads with an invalid access key", async () => {
    const signer = createSigner();
    const body = new TextEncoder().encode("bad key");

    const response = await fetch(`${ctx!.baseUrl}/upload`, {
      method: "PUT",
      headers: {
        Authorization: createAuthHeader(signer, "upload"),
        "Content-Type": "text/plain",
        "X-Access-Key": "sk_invalid",
      },
      body,
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden" });
    expect(ctx!.objectStorage.uploadCount).toBe(0);
  });

  test("uploads multiple blobs in a single batch request", async () => {
    const signer = createSigner();
    const accessKey = await createAccessKeyForStorage(ctx!.db);

    const firstBody = new TextEncoder().encode("batch one");
    const secondBody = new TextEncoder().encode("batch two");
    const firstSha256 = await computeSha256Hex(firstBody);
    const secondSha256 = await computeSha256Hex(secondBody);

    const formData = new FormData();
    formData.set(
      "manifest",
      JSON.stringify({
        uploads: [
          {
            part: "file-1",
            sha256: firstSha256,
            size: firstBody.byteLength,
            type: "text/plain",
            filename: "one.txt",
          },
          {
            part: "file-2",
            sha256: secondSha256,
            size: secondBody.byteLength,
            type: "text/plain",
            filename: "two.txt",
          },
        ],
      }),
    );
    formData.set(
      "file-1",
      new File([firstBody], "one.txt", { type: "text/plain" }),
    );
    formData.set(
      "file-2",
      new File([secondBody], "two.txt", { type: "text/plain" }),
    );

    const response = await fetch(`${ctx!.baseUrl}/upload-batch`, {
      method: "POST",
      headers: {
        Authorization: createAuthHeader(signer, "upload", {
          sha256s: [firstSha256, secondSha256],
        }),
        "X-Access-Key": accessKey,
      },
      body: formData,
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as UploadBatchResponse;
    expect(payload.results).toHaveLength(2);
    expect(payload.results[0]?.part).toBe("file-1");
    expect(payload.results[0]?.status).toBe(200);
    expect(payload.results[0]?.descriptor?.sha256).toBe(firstSha256);
    expect(payload.results[0]?.descriptor?.size).toBe(firstBody.byteLength);
    expect(payload.results[0]?.descriptor?.type).toStartWith("text/plain");
    expect(payload.results[0]?.descriptor?.url).toBe(
      `https://cdn.test/blossom/${firstSha256}`,
    );
    expect(payload.results[1]?.part).toBe("file-2");
    expect(payload.results[1]?.status).toBe(200);
    expect(payload.results[1]?.descriptor?.sha256).toBe(secondSha256);
    expect(payload.results[1]?.descriptor?.size).toBe(secondBody.byteLength);
    expect(payload.results[1]?.descriptor?.type).toStartWith("text/plain");
    expect(payload.results[1]?.descriptor?.url).toBe(
      `https://cdn.test/blossom/${secondSha256}`,
    );
    expect(ctx!.objectStorage.uploadCount).toBe(2);
  });

  test("returns partial success for batch uploads when later blobs exceed the storage limit", async () => {
    const signer = createSigner();
    const accessKey = await createAccessKeyForStorage(ctx!.db, 10);

    const firstBody = new TextEncoder().encode("12345");
    const secondBody = new TextEncoder().encode("678901");
    const firstSha256 = await computeSha256Hex(firstBody);
    const secondSha256 = await computeSha256Hex(secondBody);

    const formData = new FormData();
    formData.set(
      "manifest",
      JSON.stringify({
        uploads: [
          {
            part: "file-1",
            sha256: firstSha256,
            size: firstBody.byteLength,
            type: "text/plain",
          },
          {
            part: "file-2",
            sha256: secondSha256,
            size: secondBody.byteLength,
            type: "text/plain",
          },
        ],
      }),
    );
    formData.set(
      "file-1",
      new File([firstBody], "one.txt", { type: "text/plain" }),
    );
    formData.set(
      "file-2",
      new File([secondBody], "two.txt", { type: "text/plain" }),
    );

    const response = await fetch(`${ctx!.baseUrl}/upload-batch`, {
      method: "POST",
      headers: {
        Authorization: createAuthHeader(signer, "upload", {
          sha256s: [firstSha256, secondSha256],
        }),
        "X-Access-Key": accessKey,
      },
      body: formData,
    });

    expect(response.status).toBe(207);
    const payload = (await response.json()) as UploadBatchResponse;
    expect(payload.results).toEqual([
      {
        part: "file-1",
        status: 200,
        descriptor: expect.objectContaining({
          sha256: firstSha256,
          size: firstBody.byteLength,
        }),
      },
      {
        part: "file-2",
        status: 507,
        error: "storage limit exceeded",
      },
    ]);
    expect(ctx!.objectStorage.uploadCount).toBe(1);
    expect(await blobDb.getBlob(ctx!.db, firstSha256)).not.toBeNull();
    expect(await blobDb.getBlob(ctx!.db, secondSha256)).toBeNull();
  });
});
