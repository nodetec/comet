import { afterEach, describe, expect, test } from "bun:test";

import {
  startTestSnapshotRelay,
  type SnapshotRelayTestContext,
} from "../helpers";
import { cleanupContexts } from "./fixtures";

const contexts: SnapshotRelayTestContext[] = [];

describe("relay integration > access keys admin", () => {
  afterEach(async () => {
    await cleanupContexts(contexts);
  });

  test("returns 503 when admin token is not configured", async () => {
    const ctx = await startTestSnapshotRelay(35210);
    contexts.push(ctx);

    const response = await fetch(`${ctx.httpUrl}/admin/keys`);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "admin not configured" });
  });

  test("creates, lists, and revokes access keys", async () => {
    const ctx = await startTestSnapshotRelay(35211, {
      adminToken: "secret-token",
    });
    contexts.push(ctx);

    const unauthorized = await fetch(`${ctx.httpUrl}/admin/keys`);
    expect(unauthorized.status).toBe(401);

    const create = await fetch(`${ctx.httpUrl}/admin/keys`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret-token",
      },
      body: JSON.stringify({
        label: "test-user",
        expires_at: 1_900_000_000,
        storage_limit_bytes: 1_024,
      }),
    });

    expect(create.status).toBe(200);
    const created = (await create.json()) as {
      key: string;
      label: string;
      expires_at: number;
      storage_limit_bytes: number;
    };
    expect(created.key).toMatch(/^sk_/);
    expect(created.label).toBe("test-user");
    expect(created.expires_at).toBe(1_900_000_000);
    expect(created.storage_limit_bytes).toBe(1_024);

    const list = await fetch(`${ctx.httpUrl}/admin/keys`, {
      headers: { Authorization: "Bearer secret-token" },
    });
    expect(list.status).toBe(200);
    const listed = (await list.json()) as {
      private_mode: boolean;
      keys: Array<{
        key: string;
        label: string;
        revoked: boolean;
      }>;
    };
    expect(listed.private_mode).toBe(false);
    expect(listed.keys).toHaveLength(1);
    expect(listed.keys[0].key).toBe(created.key);
    expect(listed.keys[0].revoked).toBe(false);

    const revoke = await fetch(
      `${ctx.httpUrl}/admin/keys/${encodeURIComponent(created.key)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer secret-token",
        },
        body: JSON.stringify({ revoked: true }),
      },
    );
    expect(revoke.status).toBe(200);
    expect(await revoke.json()).toEqual({ updated: true, key: created.key });

    const listAfterRevoke = await fetch(`${ctx.httpUrl}/admin/keys`, {
      headers: { Authorization: "Bearer secret-token" },
    });
    const afterRevoke = (await listAfterRevoke.json()) as {
      keys: Array<{ revoked: boolean }>;
    };
    expect(afterRevoke.keys[0].revoked).toBe(true);

    const del = await fetch(
      `${ctx.httpUrl}/admin/keys/${encodeURIComponent(created.key)}`,
      {
        method: "DELETE",
        headers: { Authorization: "Bearer secret-token" },
      },
    );
    expect(del.status).toBe(200);
    expect(await del.json()).toEqual({ deleted: true, key: created.key });

    const listAfterDelete = await fetch(`${ctx.httpUrl}/admin/keys`, {
      headers: { Authorization: "Bearer secret-token" },
    });
    const afterDelete = (await listAfterDelete.json()) as {
      keys: Array<{ key: string }>;
    };
    expect(afterDelete.keys).toHaveLength(0);
  });
});
