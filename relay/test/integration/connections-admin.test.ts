import { afterEach, describe, expect, test } from "bun:test";

import { REVISION_SYNC_EVENT_KIND } from "../../src/types";
import {
  connectWs,
  sendJson,
  startTestRevisionRelay,
  waitForMessage,
  type RevisionRelayTestContext,
} from "../helpers";
import {
  AUTH_PUBKEY,
  authEvent,
  cleanupContexts,
  traceOptions,
} from "./fixtures";

const contexts: RevisionRelayTestContext[] = [];

describe("relay integration > admin connections", () => {
  afterEach(async () => {
    await cleanupContexts(contexts);
  });

  test("returns 503 when admin token is not configured", async () => {
    const ctx = await startTestRevisionRelay(35230);
    contexts.push(ctx);

    const response = await fetch(`${ctx.httpUrl}/admin/connections`);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "admin not configured" });
  });

  test("lists authenticated connections and live subscription ids", async () => {
    const ctx = await startTestRevisionRelay(35231, {
      privateMode: true,
      adminToken: "secret-token",
    });
    contexts.push(ctx);

    await fetch(`${ctx.httpUrl}/admin/allowlist`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret-token",
      },
      body: JSON.stringify({ pubkey: AUTH_PUBKEY }),
    });

    const ws = await connectWs(ctx.port, traceOptions(ctx, "connections"));
    const challengeMessage = await waitForMessage(
      ws,
      3_000,
      traceOptions(ctx, "connections"),
    );
    const auth = authEvent(challengeMessage[1] as string, ctx.relayUrl);

    sendJson(ws, ["AUTH", auth], traceOptions(ctx, "connections"));
    expect(
      await waitForMessage(ws, 3_000, traceOptions(ctx, "connections")),
    ).toEqual(["OK", auth.id, true, ""]);

    sendJson(
      ws,
      [
        "CHANGES",
        "sync",
        {
          since: 0,
          kinds: [REVISION_SYNC_EVENT_KIND],
          authors: [AUTH_PUBKEY],
          live: true,
        },
      ],
      traceOptions(ctx, "connections"),
    );
    await waitForMessage(ws, 3_000, traceOptions(ctx, "connections"));

    const response = await fetch(`${ctx.httpUrl}/admin/connections`, {
      headers: { Authorization: "Bearer secret-token" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      connections: [
        {
          id: expect.any(String),
          authed_pubkeys: [AUTH_PUBKEY],
          live_changes_subscription_ids: ["sync"],
        },
      ],
    });
  });
});
