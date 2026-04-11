import { afterEach, describe, expect, test } from "bun:test";

import { SNAPSHOT_SYNC_EVENT_KIND } from "../../src/types";
import {
  connectWs,
  sendJson,
  startTestSnapshotRelay,
  waitForMessage,
  type SnapshotRelayTestContext,
} from "../helpers";
import { cleanupContexts, snapshotEvent, traceOptions } from "./fixtures";

const contexts: SnapshotRelayTestContext[] = [];

describe("relay integration > admin retention api", () => {
  afterEach(async () => {
    await cleanupContexts(contexts);
  });

  test("returns the default retention policy", async () => {
    const ctx = await startTestSnapshotRelay(35_200);
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
    const ctx = await startTestSnapshotRelay(35_201, {
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
    const ctx = await startTestSnapshotRelay(35_202, {
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
      compacted_snapshots: number;
    };
    expect(updated.payload_retention_days).toBe(45);
    expect(updated.compaction_interval_seconds).toBe(600);
    expect(updated.compacted_snapshots).toBe(0);
    expect(typeof updated.updated_at).toBe("number");

    const readBack = await fetch(`${ctx.httpUrl}/admin/retention`);
    expect(readBack.status).toBe(200);
    expect(await readBack.json()).toEqual({
      payload_retention_days: 45,
      compaction_interval_seconds: 600,
      updated_at: updated.updated_at,
    });
  });

  test("applies the updated retention policy immediately to older snapshot payloads", async () => {
    const ctx = await startTestSnapshotRelay(35_203, {
      adminToken: "secret-token",
    });
    contexts.push(ctx);

    const ws = await connectWs(ctx.port, traceOptions(ctx, "admin-apply"));
    const compactedSnapshot = snapshotEvent("snapshot-1", 1_700_000_000_000);
    const retainedSnapshotA = snapshotEvent("snapshot-2", 1_700_000_000_100);
    const retainedSnapshotB = snapshotEvent("snapshot-3", 1_700_000_000_200);
    const retainedSnapshotC = snapshotEvent("snapshot-4", 1_700_000_000_300);
    const retainedSnapshotD = snapshotEvent("snapshot-5", 1_700_000_000_400);

    for (const event of [
      compactedSnapshot,
      retainedSnapshotA,
      retainedSnapshotB,
      retainedSnapshotC,
      retainedSnapshotD,
    ]) {
      sendJson(ws, ["EVENT", event], traceOptions(ctx, "admin-apply"));
      expect(
        await waitForMessage(ws, 3000, traceOptions(ctx, "admin-apply")),
      ).toEqual(["OK", event.id, true, `stored: snapshot ${event.id}`]);
    }

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
      compacted_snapshots: 1,
    });

    sendJson(
      ws,
      [
        "REQ",
        "retention-fetch",
        {
          ids: [compactedSnapshot.id, retainedSnapshotD.id],
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: ["author-1"],
        },
      ],
      traceOptions(ctx, "admin-apply"),
    );

    expect(
      await waitForMessage(ws, 3000, traceOptions(ctx, "admin-apply")),
    ).toEqual(["EVENT", "retention-fetch", retainedSnapshotD]);
    expect(
      await waitForMessage(ws, 3000, traceOptions(ctx, "admin-apply")),
    ).toEqual([
      "EVENT-STATUS",
      "retention-fetch",
      { id: compactedSnapshot.id, status: "payload_compacted" },
    ]);
    expect(
      await waitForMessage(ws, 3000, traceOptions(ctx, "admin-apply")),
    ).toEqual(["EOSE", "retention-fetch"]);
  });
});
