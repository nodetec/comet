import { afterEach, describe, expect, test } from "bun:test";

import {
  startTestSnapshotRelay,
  type SnapshotRelayTestContext,
} from "../helpers";
import { cleanupContexts } from "./fixtures";

const contexts: SnapshotRelayTestContext[] = [];

describe("relay integration > allowlist admin", () => {
  afterEach(async () => {
    await cleanupContexts(contexts);
  });

  test("returns 503 when admin token is not configured", async () => {
    const ctx = await startTestSnapshotRelay(35210);
    contexts.push(ctx);

    const response = await fetch(`${ctx.httpUrl}/admin/allowlist`);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "admin not configured" });
  });

  test("lists, upserts, and revokes allowlist entries", async () => {
    const ctx = await startTestSnapshotRelay(35211, {
      adminToken: "secret-token",
    });
    contexts.push(ctx);

    const unauthorized = await fetch(`${ctx.httpUrl}/admin/allowlist`);
    expect(unauthorized.status).toBe(401);

    const pubkey =
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    const create = await fetch(`${ctx.httpUrl}/admin/allowlist`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret-token",
      },
      body: JSON.stringify({
        pubkey,
        expires_at: 1_900_000_000,
        storage_limit_bytes: 1_024,
      }),
    });

    expect(create.status).toBe(200);
    expect(await create.json()).toEqual({
      allowed: true,
      pubkey,
      expires_at: 1_900_000_000,
      storage_limit_bytes: 1_024,
    });

    const list = await fetch(`${ctx.httpUrl}/admin/allowlist`, {
      headers: { Authorization: "Bearer secret-token" },
    });
    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject({
      private_mode: false,
      users: [
        {
          pubkey,
          expires_at: 1_900_000_000,
          storage_limit_bytes: 1_024,
        },
      ],
    });

    const revoke = await fetch(`${ctx.httpUrl}/admin/allowlist/${pubkey}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer secret-token" },
    });
    expect(revoke.status).toBe(200);
    expect(await revoke.json()).toEqual({ revoked: true, pubkey });

    const emptyList = await fetch(`${ctx.httpUrl}/admin/allowlist`, {
      headers: { Authorization: "Bearer secret-token" },
    });
    expect(emptyList.status).toBe(200);
    expect(await emptyList.json()).toEqual({
      private_mode: false,
      users: [],
    });
  });
});
