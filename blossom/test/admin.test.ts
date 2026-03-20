import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { startTestBlossom, type BlossomTestContext } from "./helpers";

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
});
