import { afterEach, describe, expect, test } from "bun:test";
import { count } from "drizzle-orm";

import { SNAPSHOT_SYNC_EVENT_KIND } from "../../src/types";
import { createSnapshotRelayDb } from "../../src/db";
import { relayEvents } from "../../src/storage/schema";
import {
  connectWs,
  sendJson,
  startTestSnapshotRelay,
  waitForMessage,
  waitForMessages,
  type SnapshotRelayTestContext,
} from "../helpers";
import {
  REV_A,
  REV_B,
  REV_C,
  cleanupContexts,
  deletionSnapshotEvent,
  genericEvent,
  snapshotEvent,
  traceOptions,
} from "./fixtures";

describe("relay integration > retention", () => {
  const contexts: SnapshotRelayTestContext[] = [];

  afterEach(async () => {
    await cleanupContexts(contexts);
  });

  test("advertises payload retention boundaries after payload compaction", async () => {
    const ctx = await startTestSnapshotRelay(39417);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const oldEvent = snapshotEvent(REV_A, 1_700_000_000_000);
    const newEvent = snapshotEvent(REV_B, 1_800_000_000_000, [REV_A]);

    sendJson(ws, ["EVENT", oldEvent], trace);
    await waitForMessage(ws, 3_000, trace);
    sendJson(ws, ["EVENT", newEvent], trace);
    await waitForMessage(ws, 3_000, trace);

    expect(await ctx.compactPayloadsBefore(1_750_000_000_000)).toBe(1);

    const response = await fetch(`http://127.0.0.1:${ctx.port}/`, {
      headers: { Accept: "application/nostr+json" },
    });

    expect(await response.json()).toEqual({
      name: "Relay",
      description:
        "Relay implementation for author-scoped snapshot sync with bootstrap replay and relay-local changes feed.",
      software: "relay",
      version: "0.1.0",
      supported_nips: [11, "CF"],
      changes_feed: {
        min_seq: 1,
      },
      snapshot_sync: {
        changes_feed: true,
        author_scoped: true,
        retention: {
          min_payload_mtime: 1_800_000_000_000,
        },
      },
    });
  });

  test("returns EVENT-STATUS when a known snapshot payload was compacted", async () => {
    const ctx = await startTestSnapshotRelay(39419);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const oldEvent = snapshotEvent(REV_A, 1_700_000_000_000);
    const newEvent = snapshotEvent(REV_B, 1_800_000_000_000, [REV_A]);

    sendJson(ws, ["EVENT", oldEvent], trace);
    await waitForMessage(ws, 3_000, trace);
    sendJson(ws, ["EVENT", newEvent], trace);
    await waitForMessage(ws, 3_000, trace);

    expect(await ctx.compactPayloadsBefore(1_750_000_000_000)).toBe(1);

    sendJson(
      ws,
      [
        "REQ",
        "fetch-compacted",
        {
          ids: [oldEvent.id],
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: ["author-1"],
        },
      ],
      trace,
    );

    expect(await waitForMessages(ws, 2, 3_000, trace)).toEqual([
      [
        "EVENT-STATUS",
        "fetch-compacted",
        { id: oldEvent.id, status: "payload_compacted" },
      ],
      ["EOSE", "fetch-compacted"],
    ]);
  });

  test("returns retained and compacted snapshots together in a mixed REQ fetch", async () => {
    const ctx = await startTestSnapshotRelay(39434);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const oldEvent = snapshotEvent(REV_A, 1_700_000_000_000);
    const newEvent = snapshotEvent(REV_B, 1_800_000_000_000, [REV_A]);

    sendJson(ws, ["EVENT", oldEvent], trace);
    await waitForMessage(ws, 3_000, trace);
    sendJson(ws, ["EVENT", newEvent], trace);
    await waitForMessage(ws, 3_000, trace);

    expect(await ctx.compactPayloadsBefore(1_750_000_000_000)).toBe(1);

    sendJson(
      ws,
      [
        "REQ",
        "fetch-mixed",
        {
          ids: [oldEvent.id, newEvent.id],
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: ["author-1"],
        },
      ],
      trace,
    );

    expect(await waitForMessages(ws, 3, 3_000, trace)).toEqual([
      ["EVENT", "fetch-mixed", newEvent],
      [
        "EVENT-STATUS",
        "fetch-mixed",
        { id: oldEvent.id, status: "payload_compacted" },
      ],
      ["EOSE", "fetch-mixed"],
    ]);
  });

  test("retains the latest snapshot payload after compacting older snapshots", async () => {
    const ctx = await startTestSnapshotRelay(39451);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const oldEvent = snapshotEvent(REV_A, 1_700_000_000_000);
    const headEvent = snapshotEvent(REV_B, 1_800_000_000_000, [REV_A]);

    sendJson(ws, ["EVENT", oldEvent], trace);
    await waitForMessage(ws, 3_000, trace);
    sendJson(ws, ["EVENT", headEvent], trace);
    await waitForMessage(ws, 3_000, trace);

    expect(await ctx.compactPayloadsBefore(1_900_000_000_000)).toBe(1);

    sendJson(
      ws,
      [
        "REQ",
        "fetch-head",
        {
          ids: [headEvent.id],
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: ["author-1"],
        },
      ],
      trace,
    );

    expect(await waitForMessages(ws, 2, 3_000, trace)).toEqual([
      ["EVENT", "fetch-head", headEvent],
      ["EOSE", "fetch-head"],
    ]);
  });

  test("retains only the most recent snapshot payload for a document during compaction", async () => {
    const ctx = await startTestSnapshotRelay(39454);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const baseEvent = snapshotEvent(REV_A, 1_700_000_000_000);
    const leftHead = snapshotEvent(REV_B, 1_800_000_000_000, [REV_A]);
    const rightHead = snapshotEvent(REV_C, 1_800_000_000_100, [REV_A]);

    for (const event of [baseEvent, leftHead, rightHead]) {
      sendJson(ws, ["EVENT", event], trace);
      await waitForMessage(ws, 3_000, trace);
    }

    expect(await ctx.compactPayloadsBefore(1_900_000_000_000)).toBe(2);

    sendJson(
      ws,
      [
        "REQ",
        "fetch-conflict-heads",
        {
          ids: [leftHead.id, rightHead.id],
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: ["author-1"],
        },
      ],
      trace,
    );

    expect(await waitForMessages(ws, 3, 3_000, trace)).toEqual([
      ["EVENT", "fetch-conflict-heads", rightHead],
      [
        "EVENT-STATUS",
        "fetch-conflict-heads",
        { id: leftHead.id, status: "payload_compacted" },
      ],
      ["EOSE", "fetch-conflict-heads"],
    ]);
  });

  test("retains the latest tombstone snapshot during compaction", async () => {
    const ctx = await startTestSnapshotRelay(39455);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const baseEvent = snapshotEvent(REV_A, 1_700_000_000_000);
    const tombstoneEvent = deletionSnapshotEvent(REV_B, 1_800_000_000_000, [
      REV_A,
    ]);

    sendJson(ws, ["EVENT", baseEvent], trace);
    await waitForMessage(ws, 3_000, trace);
    sendJson(ws, ["EVENT", tombstoneEvent], trace);
    await waitForMessage(ws, 3_000, trace);

    expect(await ctx.compactPayloadsBefore(1_900_000_000_000)).toBe(1);

    sendJson(
      ws,
      [
        "REQ",
        "fetch-tombstone",
        {
          ids: [tombstoneEvent.id],
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: ["author-1"],
        },
      ],
      trace,
    );

    expect(await waitForMessages(ws, 2, 3_000, trace)).toEqual([
      ["EVENT", "fetch-tombstone", tombstoneEvent],
      ["EOSE", "fetch-tombstone"],
    ]);
  });

  test("compacts payloads independently across multiple documents in one author namespace", async () => {
    const ctx = await startTestSnapshotRelay(39468);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const oldDocBase = snapshotEvent(REV_A, 1_700_000_000_000, [], "doc-old");
    const oldDocHead = snapshotEvent(
      REV_B,
      1_800_000_000_000,
      [REV_A],
      "doc-old",
    );
    const otherDocHead = snapshotEvent(
      REV_C,
      1_850_000_000_000,
      [],
      "doc-other",
    );

    for (const event of [oldDocBase, oldDocHead, otherDocHead]) {
      sendJson(ws, ["EVENT", event], trace);
      await waitForMessage(ws, 3_000, trace);
    }

    expect(await ctx.compactPayloadsBefore(1_825_000_000_000)).toBe(1);

    sendJson(
      ws,
      [
        "REQ",
        "multi-doc-retention",
        {
          ids: [oldDocBase.id, oldDocHead.id, otherDocHead.id],
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: ["author-1"],
        },
      ],
      trace,
    );

    expect(await waitForMessages(ws, 4, 3_000, trace)).toEqual([
      ["EVENT", "multi-doc-retention", oldDocHead],
      ["EVENT", "multi-doc-retention", otherDocHead],
      [
        "EVENT-STATUS",
        "multi-doc-retention",
        { id: oldDocBase.id, status: "payload_compacted" },
      ],
      ["EOSE", "multi-doc-retention"],
    ]);
  });

  test("does not compact configured generic event storage", async () => {
    const ctx = await startTestSnapshotRelay(39469, {
      companionKinds: [10002],
    });
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const generic = genericEvent("generic-retained", 10002, [
      ["p", "author-1"],
    ]);
    const oldEvent = snapshotEvent(REV_A, 1_700_000_000_000);
    const headEvent = snapshotEvent(REV_B, 1_800_000_000_000, [REV_A]);

    sendJson(ws, ["EVENT", generic], trace);
    await waitForMessage(ws, 3_000, trace);
    sendJson(ws, ["EVENT", oldEvent], trace);
    await waitForMessage(ws, 3_000, trace);
    sendJson(ws, ["EVENT", headEvent], trace);
    await waitForMessage(ws, 3_000, trace);

    expect(await ctx.compactPayloadsBefore(1_900_000_000_000)).toBe(1);

    const { db, sql } = createSnapshotRelayDb(ctx.databaseUrl);
    try {
      const [genericCountRow] = await db
        .select({ value: count() })
        .from(relayEvents);
      expect(genericCountRow.value).toBe(1);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});
