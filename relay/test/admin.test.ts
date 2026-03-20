import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { startTestRelay, type TestContext } from "./helpers";

const ADMIN_TOKEN = "test-admin-token";
let ctx: TestContext;

beforeAll(async () => {
  process.env.ADMIN_TOKEN = ADMIN_TOKEN;
  ctx = await startTestRelay(39200);
});

afterAll(async () => {
  await ctx.cleanup();
  delete process.env.ADMIN_TOKEN;
});

describe("GET /admin/connections", () => {
  test("returns 401 without admin token", async () => {
    const res = await fetch(`http://localhost:${ctx.port}/admin/connections`);
    expect(res.status).toBe(401);
  });

  test("returns 401 with wrong token", async () => {
    const res = await fetch(`http://localhost:${ctx.port}/admin/connections`, {
      headers: { Authorization: "Bearer wrong-token" },
    });
    expect(res.status).toBe(401);
  });

  test("returns connections array with valid token", async () => {
    const res = await fetch(`http://localhost:${ctx.port}/admin/connections`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("connections");
    expect(Array.isArray(body.connections)).toBe(true);
  });
});
