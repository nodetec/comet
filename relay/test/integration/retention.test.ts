import { afterEach, describe, expect, test } from "bun:test";
import { count } from "drizzle-orm";

import { createSnapshotRelayDb } from "../../src/db";
import { relayEvents } from "../../src/storage/schema";
import { SNAPSHOT_SYNC_EVENT_KIND } from "../../src/types";
import {
  connectWs,
  sendJson,
  startTestSnapshotRelay,
  waitForMessage,
  waitForMessages,
  type SnapshotRelayTestContext,
} from "../helpers";
import {
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
    const compactedEvent = snapshotEvent("snapshot-1", 1_700_000_000_000);
    const retainedEventA = snapshotEvent("snapshot-2", 1_750_000_000_000);
    const retainedEventB = snapshotEvent("snapshot-3", 1_800_000_000_000);
    const retainedEventC = snapshotEvent("snapshot-4", 1_850_000_000_000);
    const retainedEventD = snapshotEvent("snapshot-5", 1_900_000_000_000);

    for (const event of [
      compactedEvent,
      retainedEventA,
      retainedEventB,
      retainedEventC,
      retainedEventD,
    ]) {
      sendJson(ws, ["EVENT", event], trace);
      await waitForMessage(ws, 3_000, trace);
    }

    expect(await ctx.compactPayloadsBefore(1_850_000_000_000)).toBe(1);

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
          snapshot_retention: {
            mode: "nondominated_plus_recent_history",
            recent_count: 4,
            min_created_at: 1_750_000_000,
          },
        },
      },
    });
  });

  test("returns EVENT-STATUS when a known snapshot payload was compacted", async () => {
    const ctx = await startTestSnapshotRelay(39419);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const compactedEvent = snapshotEvent("snapshot-1", 1_700_000_000_000);

    for (const event of [
      compactedEvent,
      snapshotEvent("snapshot-2", 1_750_000_000_000),
      snapshotEvent("snapshot-3", 1_800_000_000_000),
      snapshotEvent("snapshot-4", 1_850_000_000_000),
      snapshotEvent("snapshot-5", 1_900_000_000_000),
    ]) {
      sendJson(ws, ["EVENT", event], trace);
      await waitForMessage(ws, 3_000, trace);
    }

    expect(await ctx.compactPayloadsBefore(1_850_000_000_000)).toBe(1);

    sendJson(
      ws,
      [
        "REQ",
        "fetch-compacted",
        {
          ids: [compactedEvent.id],
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
        { id: compactedEvent.id, status: "payload_compacted" },
      ],
      ["EOSE", "fetch-compacted"],
    ]);
  });

  test("returns retained and compacted snapshots together in a mixed REQ fetch", async () => {
    const ctx = await startTestSnapshotRelay(39434);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const compactedEvent = snapshotEvent("snapshot-1", 1_700_000_000_000);
    const newestEvent = snapshotEvent("snapshot-5", 1_900_000_000_000);

    for (const event of [
      compactedEvent,
      snapshotEvent("snapshot-2", 1_750_000_000_000),
      snapshotEvent("snapshot-3", 1_800_000_000_000),
      snapshotEvent("snapshot-4", 1_850_000_000_000),
      newestEvent,
    ]) {
      sendJson(ws, ["EVENT", event], trace);
      await waitForMessage(ws, 3_000, trace);
    }

    expect(await ctx.compactPayloadsBefore(1_850_000_000_000)).toBe(1);

    sendJson(
      ws,
      [
        "REQ",
        "fetch-mixed",
        {
          ids: [compactedEvent.id, newestEvent.id],
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: ["author-1"],
        },
      ],
      trace,
    );

    expect(await waitForMessages(ws, 3, 3_000, trace)).toEqual([
      ["EVENT", "fetch-mixed", newestEvent],
      [
        "EVENT-STATUS",
        "fetch-mixed",
        { id: compactedEvent.id, status: "payload_compacted" },
      ],
      ["EOSE", "fetch-mixed"],
    ]);
  });

  test("retains the newest snapshot payload after compacting older snapshots", async () => {
    const ctx = await startTestSnapshotRelay(39451);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const newestEvent = snapshotEvent("snapshot-5", 1_900_000_000_000);

    for (const event of [
      snapshotEvent("snapshot-1", 1_700_000_000_000),
      snapshotEvent("snapshot-2", 1_750_000_000_000),
      snapshotEvent("snapshot-3", 1_800_000_000_000),
      snapshotEvent("snapshot-4", 1_850_000_000_000),
      newestEvent,
    ]) {
      sendJson(ws, ["EVENT", event], trace);
      await waitForMessage(ws, 3_000, trace);
    }

    expect(await ctx.compactPayloadsBefore(1_950_000_000_000)).toBe(1);

    sendJson(
      ws,
      [
        "REQ",
        "fetch-head",
        {
          ids: [newestEvent.id],
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: ["author-1"],
        },
      ],
      trace,
    );

    expect(await waitForMessages(ws, 2, 3_000, trace)).toEqual([
      ["EVENT", "fetch-head", newestEvent],
      ["EOSE", "fetch-head"],
    ]);
  });

  test("retains a recent per-document snapshot window during compaction", async () => {
    const ctx = await startTestSnapshotRelay(39454);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const compactedEvent = snapshotEvent("snapshot-1", 1_700_000_000_000);
    const retainedEventA = snapshotEvent("snapshot-2", 1_750_000_000_000);
    const retainedEventB = snapshotEvent("snapshot-3", 1_800_000_000_000);
    const retainedEventC = snapshotEvent("snapshot-4", 1_850_000_000_000);
    const retainedEventD = snapshotEvent("snapshot-5", 1_900_000_000_000);

    for (const event of [
      compactedEvent,
      retainedEventA,
      retainedEventB,
      retainedEventC,
      retainedEventD,
    ]) {
      sendJson(ws, ["EVENT", event], trace);
      await waitForMessage(ws, 3_000, trace);
    }

    expect(await ctx.compactPayloadsBefore(1_950_000_000_000)).toBe(1);

    sendJson(
      ws,
      [
        "REQ",
        "fetch-retained-window",
        {
          ids: [
            compactedEvent.id,
            retainedEventA.id,
            retainedEventB.id,
            retainedEventC.id,
            retainedEventD.id,
          ],
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: ["author-1"],
        },
      ],
      trace,
    );

    expect(await waitForMessages(ws, 6, 3_000, trace)).toEqual([
      ["EVENT", "fetch-retained-window", retainedEventA],
      ["EVENT", "fetch-retained-window", retainedEventB],
      ["EVENT", "fetch-retained-window", retainedEventC],
      ["EVENT", "fetch-retained-window", retainedEventD],
      [
        "EVENT-STATUS",
        "fetch-retained-window",
        { id: compactedEvent.id, status: "payload_compacted" },
      ],
      ["EOSE", "fetch-retained-window"],
    ]);
  });

  test("retains an older concurrent snapshot during compaction", async () => {
    const ctx = await startTestSnapshotRelay(39456);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const compactedOldest = snapshotEvent(
      "snapshot-1",
      1_700_000_000_000,
      [],
      "doc-1",
      "put",
      "author-1",
      { "DEVICE-A": 1 },
    );
    const retainedConcurrent = snapshotEvent(
      "snapshot-2",
      1_700_000_000_100,
      [],
      "doc-1",
      "put",
      "author-1",
      { "DEVICE-B": 1 },
    );
    const dominatedA = snapshotEvent(
      "snapshot-3",
      1_700_000_000_200,
      [],
      "doc-1",
      "put",
      "author-1",
      { "DEVICE-A": 2 },
    );
    const dominatedB = snapshotEvent(
      "snapshot-4",
      1_700_000_000_300,
      [],
      "doc-1",
      "put",
      "author-1",
      { "DEVICE-A": 3 },
    );
    const dominatedC = snapshotEvent(
      "snapshot-5",
      1_700_000_000_400,
      [],
      "doc-1",
      "put",
      "author-1",
      { "DEVICE-A": 4 },
    );
    const currentEvent = snapshotEvent(
      "snapshot-6",
      1_700_000_000_500,
      [],
      "doc-1",
      "put",
      "author-1",
      { "DEVICE-A": 5 },
    );

    for (const event of [
      compactedOldest,
      retainedConcurrent,
      dominatedA,
      dominatedB,
      dominatedC,
      currentEvent,
    ]) {
      sendJson(ws, ["EVENT", event], trace);
      await waitForMessage(ws, 3_000, trace);
    }

    expect(await ctx.compactPayloadsBefore(1_800_000_000_000)).toBe(2);

    sendJson(
      ws,
      [
        "REQ",
        "fetch-concurrent-retention",
        {
          ids: [compactedOldest.id, retainedConcurrent.id, currentEvent.id],
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: ["author-1"],
        },
      ],
      trace,
    );

    expect(await waitForMessages(ws, 4, 3_000, trace)).toEqual([
      ["EVENT", "fetch-concurrent-retention", retainedConcurrent],
      ["EVENT", "fetch-concurrent-retention", currentEvent],
      [
        "EVENT-STATUS",
        "fetch-concurrent-retention",
        { id: compactedOldest.id, status: "payload_compacted" },
      ],
      ["EOSE", "fetch-concurrent-retention"],
    ]);
  });

  test("retains the latest tombstone snapshot during compaction", async () => {
    const ctx = await startTestSnapshotRelay(39455);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const tombstoneEvent = deletionSnapshotEvent(
      "snapshot-5",
      1_900_000_000_000,
      [],
    );

    for (const event of [
      snapshotEvent("snapshot-1", 1_700_000_000_000),
      snapshotEvent("snapshot-2", 1_750_000_000_000),
      snapshotEvent("snapshot-3", 1_800_000_000_000),
      snapshotEvent("snapshot-4", 1_850_000_000_000),
      tombstoneEvent,
    ]) {
      sendJson(ws, ["EVENT", event], trace);
      await waitForMessage(ws, 3_000, trace);
    }

    expect(await ctx.compactPayloadsBefore(1_950_000_000_000)).toBe(1);

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
    const compactedOldDocEvent = snapshotEvent(
      "old-1",
      1_700_000_000_000,
      [],
      "doc-old",
    );
    const oldDocRetainedA = snapshotEvent(
      "old-2",
      1_750_000_000_000,
      [],
      "doc-old",
    );
    const oldDocRetainedB = snapshotEvent(
      "old-3",
      1_800_000_000_000,
      [],
      "doc-old",
    );
    const oldDocRetainedC = snapshotEvent(
      "old-4",
      1_850_000_000_000,
      [],
      "doc-old",
    );
    const oldDocHead = snapshotEvent("old-5", 1_900_000_000_000, [], "doc-old");
    const otherDocHead = snapshotEvent(
      "other-1",
      1_850_000_000_000,
      [],
      "doc-other",
    );

    for (const event of [
      compactedOldDocEvent,
      oldDocRetainedA,
      oldDocRetainedB,
      oldDocRetainedC,
      oldDocHead,
      otherDocHead,
    ]) {
      sendJson(ws, ["EVENT", event], trace);
      await waitForMessage(ws, 3_000, trace);
    }

    expect(await ctx.compactPayloadsBefore(1_950_000_000_000)).toBe(1);

    sendJson(
      ws,
      [
        "REQ",
        "multi-doc-retention",
        {
          ids: [compactedOldDocEvent.id, oldDocHead.id, otherDocHead.id],
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: ["author-1"],
        },
      ],
      trace,
    );

    expect(await waitForMessages(ws, 4, 3_000, trace)).toEqual([
      ["EVENT", "multi-doc-retention", otherDocHead],
      ["EVENT", "multi-doc-retention", oldDocHead],
      [
        "EVENT-STATUS",
        "multi-doc-retention",
        { id: compactedOldDocEvent.id, status: "payload_compacted" },
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

    sendJson(ws, ["EVENT", generic], trace);
    await waitForMessage(ws, 3_000, trace);

    for (const event of [
      snapshotEvent("snapshot-1", 1_700_000_000_000),
      snapshotEvent("snapshot-2", 1_750_000_000_000),
      snapshotEvent("snapshot-3", 1_800_000_000_000),
      snapshotEvent("snapshot-4", 1_850_000_000_000),
      snapshotEvent("snapshot-5", 1_900_000_000_000),
    ]) {
      sendJson(ws, ["EVENT", event], trace);
      await waitForMessage(ws, 3_000, trace);
    }

    expect(await ctx.compactPayloadsBefore(1_950_000_000_000)).toBe(1);

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
