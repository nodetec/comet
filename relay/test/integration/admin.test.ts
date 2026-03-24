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
  REV_A,
  REV_B,
  cleanupContexts,
  revisionEvent,
  traceOptions,
} from "./fixtures";

const contexts: RevisionRelayTestContext[] = [];

describe("relay integration > admin retention api", () => {
  afterEach(async () => {
    await cleanupContexts(contexts);
  });

  test("returns the default retention policy", async () => {
    const ctx = await startTestRevisionRelay(35200);
    contexts.push(ctx);

    const response = await fetch(`${ctx.httpUrl}/admin/retention`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      payload_retention_days: null,
      compaction_interval_seconds: 300,
      updated_at: null,
    });
  });

  test("requires bearer auth for retention updates when an admin token is configured", async () => {
    const ctx = await startTestRevisionRelay(35201, {
      adminToken: "secret-token",
    });
    contexts.push(ctx);

    const response = await fetch(`${ctx.httpUrl}/admin/retention`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload_retention_days: 30 }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  test("updates and persists the retention policy through the admin api", async () => {
    const ctx = await startTestRevisionRelay(35202, {
      adminToken: "secret-token",
    });
    contexts.push(ctx);

    const update = await fetch(`${ctx.httpUrl}/admin/retention`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret-token",
      },
      body: JSON.stringify({
        payload_retention_days: 45,
        compaction_interval_seconds: 600,
      }),
    });

    expect(update.status).toBe(200);
    const updated = (await update.json()) as {
      payload_retention_days: number | null;
      compaction_interval_seconds: number;
      updated_at: number | null;
      compacted_revisions: number;
    };
    expect(updated.payload_retention_days).toBe(45);
    expect(updated.compaction_interval_seconds).toBe(600);
    expect(updated.compacted_revisions).toBe(0);
    expect(typeof updated.updated_at).toBe("number");

    const readBack = await fetch(`${ctx.httpUrl}/admin/retention`);
    expect(readBack.status).toBe(200);
    expect(await readBack.json()).toEqual({
      payload_retention_days: 45,
      compaction_interval_seconds: 600,
      updated_at: updated.updated_at,
    });
  });

  test("applies the updated retention policy immediately to old non-head payloads", async () => {
    const ctx = await startTestRevisionRelay(35203, {
      adminToken: "secret-token",
    });
    contexts.push(ctx);

    const ws = await connectWs(ctx.port, traceOptions(ctx, "admin-apply"));
    const parent = revisionEvent(REV_A, 1_700_000_000_000);
    const head = revisionEvent(REV_B, 1_700_000_000_100, [REV_A]);

    sendJson(ws, ["EVENT", parent], traceOptions(ctx, "admin-apply"));
    expect(
      await waitForMessage(ws, 3_000, traceOptions(ctx, "admin-apply")),
    ).toEqual(["OK", parent.id, true, `stored: revision ${REV_A}`]);

    sendJson(ws, ["EVENT", head], traceOptions(ctx, "admin-apply"));
    expect(
      await waitForMessage(ws, 3_000, traceOptions(ctx, "admin-apply")),
    ).toEqual(["OK", head.id, true, `stored: revision ${REV_B}`]);

    const update = await fetch(`${ctx.httpUrl}/admin/retention`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret-token",
      },
      body: JSON.stringify({
        payload_retention_days: 1,
        compaction_interval_seconds: 600,
      }),
    });

    expect(update.status).toBe(200);
    expect(await update.json()).toMatchObject({
      payload_retention_days: 1,
      compacted_revisions: 1,
    });

    sendJson(
      ws,
      [
        "REQ",
        "retention-fetch",
        {
          kinds: [REVISION_SYNC_EVENT_KIND],
          "#p": ["recipient-1"],
          "#r": [REV_A, REV_B],
        },
      ],
      traceOptions(ctx, "admin-apply"),
    );

    expect(
      await waitForMessage(ws, 3_000, traceOptions(ctx, "admin-apply")),
    ).toEqual(["EVENT", "retention-fetch", head]);
    expect(
      await waitForMessage(ws, 3_000, traceOptions(ctx, "admin-apply")),
    ).toEqual([
      "EVENT-STATUS",
      "retention-fetch",
      { rev: REV_A, status: "payload_compacted" },
    ]);
    expect(
      await waitForMessage(ws, 3_000, traceOptions(ctx, "admin-apply")),
    ).toEqual(["EOSE", "retention-fetch"]);
  });
});
