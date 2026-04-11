import { afterEach, describe, expect, test } from "bun:test";
import { count } from "drizzle-orm";

import { createSnapshotRelayDb } from "../../src/db";
import {
  relayEvents,
  syncChanges,
  syncSnapshots,
} from "../../src/storage/schema";
import { SNAPSHOT_SYNC_EVENT_KIND } from "../../src/types";
import {
  connectWs,
  sendJson,
  startTestSnapshotRelay,
  waitForBootstrapSnapshots,
  waitForMessage,
  waitForMessages,
  type SnapshotRelayTestContext,
} from "../helpers";
import {
  cleanupContexts,
  genericEvent,
  snapshotEvent,
  traceOptions,
} from "./fixtures";

describe("relay integration > companion/pass-through", () => {
  const contexts: SnapshotRelayTestContext[] = [];

  afterEach(async () => {
    await cleanupContexts(contexts);
  });

  test("stores explicitly configured companion kinds without entering snapshot sync state", async () => {
    const ctx = await startTestSnapshotRelay(39_456, {
      companionKinds: [10_002],
    });
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const event = genericEvent("companion-event-1", 10_002, [
      ["p", "author-1"],
    ]);

    sendJson(ws, ["EVENT", event], trace);
    expect(await waitForMessage(ws, 3000, trace)).toEqual([
      "OK",
      event.id,
      true,
      "stored: companion event kind=10002",
    ]);

    const { db, sql } = createSnapshotRelayDb(ctx.databaseUrl);
    try {
      const [genericCountRow] = await db
        .select({ value: count() })
        .from(relayEvents);
      const [snapshotCountRow] = await db
        .select({ value: count() })
        .from(syncSnapshots);
      const [changeCountRow] = await db
        .select({ value: count() })
        .from(syncChanges);

      expect(genericCountRow.value).toBe(1);
      expect(snapshotCountRow.value).toBe(0);
      expect(changeCountRow.value).toBe(0);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  test("stores explicitly configured pass-through kinds without entering snapshot sync state", async () => {
    const ctx = await startTestSnapshotRelay(39_457, {
      passThroughKinds: [1],
    });
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const event = genericEvent("pass-through-event-1", 1, [["p", "author-1"]]);

    sendJson(ws, ["EVENT", event], trace);
    expect(await waitForMessage(ws, 3000, trace)).toEqual([
      "OK",
      event.id,
      true,
      "stored: pass-through event kind=1",
    ]);

    const { db, sql } = createSnapshotRelayDb(ctx.databaseUrl);
    try {
      const [genericCountRow] = await db
        .select({ value: count() })
        .from(relayEvents);
      const [snapshotCountRow] = await db
        .select({ value: count() })
        .from(syncSnapshots);
      const [changeCountRow] = await db
        .select({ value: count() })
        .from(syncChanges);

      expect(genericCountRow.value).toBe(1);
      expect(snapshotCountRow.value).toBe(0);
      expect(changeCountRow.value).toBe(0);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  test("returns duplicate semantics for configured companion events", async () => {
    const ctx = await startTestSnapshotRelay(39_458, {
      companionKinds: [10_002],
    });
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const event = genericEvent("companion-event-duplicate", 10_002);

    sendJson(ws, ["EVENT", event], trace);
    await waitForMessage(ws, 3000, trace);

    sendJson(ws, ["EVENT", event], trace);
    expect(await waitForMessage(ws, 3000, trace)).toEqual([
      "OK",
      event.id,
      false,
      "duplicate: event already exists",
    ]);
  });

  test("excludes configured generic kinds from snapshot CHANGES and bootstrap", async () => {
    const ctx = await startTestSnapshotRelay(39_459, {
      companionKinds: [10_002],
      passThroughKinds: [1],
    });
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const companionEvent = genericEvent("companion-event-scope", 10_002, [
      ["p", "author-1"],
    ]);
    const passThroughEvent = genericEvent("pass-through-event-scope", 1, [
      ["p", "author-1"],
    ]);

    sendJson(ws, ["EVENT", companionEvent], trace);
    await waitForMessage(ws, 3000, trace);
    sendJson(ws, ["EVENT", passThroughEvent], trace);
    await waitForMessage(ws, 3000, trace);

    sendJson(
      ws,
      [
        "CHANGES",
        "snapshot-only",
        {
          mode: "tail",
          since: 0,
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: ["author-1"],
        },
      ],
      trace,
    );
    expect(await waitForMessages(ws, 1, 3000, trace)).toEqual([
      ["CHANGES", "snapshot-only", "EOSE", 0],
    ]);

    sendJson(
      ws,
      [
        "CHANGES",
        "generic-scope",
        {
          mode: "bootstrap",
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: ["author-1"],
        },
      ],
      trace,
    );
    expect(await waitForBootstrapSnapshots(ws, "generic-scope", trace)).toEqual(
      {
        snapshotSeq: 0,
        snapshots: [],
      },
    );
  });

  test("keeps live snapshot CHANGES isolated while generic traffic is interleaved", async () => {
    const ctx = await startTestSnapshotRelay(39_470, {
      companionKinds: [10_002],
      passThroughKinds: [1],
    });
    contexts.push(ctx);

    const subscriberTrace = traceOptions(ctx, "subscriber");
    const publisherTrace = traceOptions(ctx, "publisher");
    const subscriber = await connectWs(ctx.port, subscriberTrace);
    const publisher = await connectWs(ctx.port, publisherTrace);

    sendJson(
      subscriber,
      [
        "CHANGES",
        "snapshot-live",
        {
          mode: "tail",
          since: 0,
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: ["author-1"],
          live: true,
        },
      ],
      subscriberTrace,
    );
    expect(await waitForMessage(subscriber, 3000, subscriberTrace)).toEqual([
      "CHANGES",
      "snapshot-live",
      "EOSE",
      0,
    ]);

    const snapshotOne = genericEvent("ignored-generic-1", 10_002, [
      ["p", "author-1"],
    ]);
    const snapshotEventOne = genericEvent("ignored-generic-2", 1, [
      ["p", "author-1"],
    ]);
    const syncOne = snapshotEvent(
      "snapshot-1",
      1_700_000_000_000,
      [],
      "doc-1",
      "put",
      "author-1",
    );
    const syncTwo = snapshotEvent(
      "snapshot-2",
      1_700_000_000_100,
      [],
      "doc-1",
      "put",
      "author-1",
    );

    const firstLive = waitForMessage(subscriber, 3000, subscriberTrace);
    sendJson(publisher, ["EVENT", snapshotOne], publisherTrace);
    await waitForMessage(publisher, 3000, publisherTrace);
    sendJson(publisher, ["EVENT", syncOne], publisherTrace);
    await waitForMessage(publisher, 3000, publisherTrace);
    expect(await firstLive).toEqual([
      "CHANGES",
      "snapshot-live",
      "EVENT",
      1,
      syncOne,
    ]);

    const secondLive = waitForMessage(subscriber, 3000, subscriberTrace);
    sendJson(publisher, ["EVENT", snapshotEventOne], publisherTrace);
    await waitForMessage(publisher, 3000, publisherTrace);
    sendJson(publisher, ["EVENT", syncTwo], publisherTrace);
    await waitForMessage(publisher, 3000, publisherTrace);
    expect(await secondLive).toEqual([
      "CHANGES",
      "snapshot-live",
      "EVENT",
      2,
      syncTwo,
    ]);
  });
});
