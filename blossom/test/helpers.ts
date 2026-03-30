import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
} from "nostr-tools/pure";
import { relayAllowedUsers } from "@comet/data";
import { KIND_BLOSSOM_AUTH, type NostrEvent } from "@comet/nostr";
import { createBlossomServer } from "../src/server";
import type { DB } from "../src/db";
import type { ObjectStorage } from "../src/object-storage";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://localhost/comet_test";

export type TestSigner = {
  secretKey: Uint8Array;
  pubkey: string;
};

export type FakeStoredBlob = {
  data: Uint8Array;
  contentType: string;
};

export type FakeObjectStorage = ObjectStorage & {
  blobs: Map<string, FakeStoredBlob>;
  deletedKeys: string[];
  uploadCount: number;
  deleteCount: number;
};

export type BlossomTestContext = {
  db: DB;
  sql: Awaited<ReturnType<typeof createBlossomServer>>["sql"];
  objectStorage: FakeObjectStorage;
  port: number;
  baseUrl: string;
  cleanup: () => Promise<void>;
};

export function createSigner(): TestSigner {
  const secretKey = generateSecretKey();
  return {
    secretKey,
    pubkey: getPublicKey(secretKey),
  };
}

export function createAuthHeader(
  signer: TestSigner,
  action: "upload" | "delete" | "list",
  options: {
    created_at?: number;
    expiration?: number;
    sha256?: string;
    sha256s?: string[];
    overrides?: Partial<NostrEvent>;
  } = {},
): string {
  const tags = [["t", action]];
  if (options.expiration !== undefined) {
    tags.push(["expiration", String(options.expiration)]);
  }
  if (options.sha256) {
    tags.push(["x", options.sha256]);
  }
  for (const sha256 of options.sha256s ?? []) {
    tags.push(["x", sha256]);
  }

  const event = finalizeEvent(
    {
      kind: KIND_BLOSSOM_AUTH,
      content: "",
      tags,
      created_at: options.created_at ?? Math.floor(Date.now() / 1000),
      ...options.overrides,
    },
    signer.secretKey,
  );

  return `Nostr ${Buffer.from(JSON.stringify(event)).toString("base64url")}`;
}

export function createFakeObjectStorage(
  publicBaseUrl = "https://cdn.test/blossom",
): FakeObjectStorage {
  const blobs = new Map<string, FakeStoredBlob>();
  const deletedKeys: string[] = [];

  return {
    blobs,
    deletedKeys,
    uploadCount: 0,
    deleteCount: 0,
    publicBaseUrl,
    getPublicUrl(sha256: string): string {
      return `${this.publicBaseUrl}/${sha256}`;
    },
    downloadBlob(
      sha256: string,
    ): Promise<{ data: Uint8Array; contentType?: string }> {
      const blob = blobs.get(sha256);
      if (!blob) {
        return Promise.reject(new Error(`blob not found: ${sha256}`));
      }

      return Promise.resolve({
        data: new Uint8Array(blob.data),
        contentType: blob.contentType,
      });
    },
    uploadBlob(
      sha256: string,
      data: Uint8Array,
      contentType?: string,
    ): Promise<void> {
      this.uploadCount += 1;
      blobs.set(sha256, {
        data: new Uint8Array(data),
        contentType: contentType ?? "application/octet-stream",
      });
      return Promise.resolve();
    },
    deleteBlob(sha256: string): Promise<void> {
      this.deleteCount += 1;
      deletedKeys.push(sha256);
      blobs.delete(sha256);
      return Promise.resolve();
    },
  };
}

export async function startTestBlossom(): Promise<BlossomTestContext> {
  const objectStorage = createFakeObjectStorage();
  const runtime = await createBlossomServer({
    port: 0,
    databaseUrl: TEST_DB_URL,
    objectStorage,
    resetDatabase: true,
  });

  return {
    db: runtime.db,
    sql: runtime.sql,
    objectStorage,
    port: runtime.port,
    baseUrl: `http://127.0.0.1:${runtime.port}`,
    cleanup: runtime.stop,
  };
}

export async function allowStorageForPubkey(
  db: DB,
  pubkey: string,
  storageLimitBytes: number | null = null,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .insert(relayAllowedUsers)
    .values({ pubkey, storageLimitBytes, createdAt: now })
    .onConflictDoUpdate({
      target: relayAllowedUsers.pubkey,
      set: { storageLimitBytes },
    });
}
