import { afterEach, describe, expect, test } from "bun:test";

import { SNAPSHOT_SYNC_EVENT_KIND } from "../../src/types";
import {
  connectWs,
  expectNoMessage,
  sendJson,
  startTestSnapshotRelay,
  waitFor,
  waitForMessage,
  waitForMessages,
  type SnapshotRelayTestContext,
} from "../helpers";
import {
  REV_A,
  REV_B,
  cleanupContexts,
  snapshotEvent,
  traceOptions,
} from "./fixtures";

describe("relay integration > changes", () => {
  const contexts: SnapshotRelayTestContext[] = [];

  afterEach(async () => {
    await cleanupContexts(contexts);
  });

  test("stores a snapshot event and replays it through CHANGES", async () => {
    const ctx = await startTestSnapshotRelay(39410);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const event = snapshotEvent(REV_A);

    sendJson(ws, ["EVENT", event], trace);
    expect(await waitForMessage(ws, 3_000, trace)).toEqual([
      "OK",
      event.id,
      true,
      `stored: snapshot ${event.id}`,
    ]);

    sendJson(
      ws,
      [
        "CHANGES",
        "sync-1",
        {
          mode: "tail",
          since: 0,
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: ["author-1"],
        },
      ],
      trace,
    );

    expect(await waitForMessages(ws, 2, 3_000, trace)).toEqual([
      ["CHANGES", "sync-1", "EVENT", 1, event],
      ["CHANGES", "sync-1", "EOSE", 1],
    ]);
  });

  test("filters CHANGES replay by document id", async () => {
    const ctx = await startTestSnapshotRelay(39463);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const firstEvent = snapshotEvent(REV_A, 1_700_000_000_000, [], "doc-1");
    const secondEvent = snapshotEvent(REV_B, 1_700_000_000_100, [], "doc-2");

    for (const event of [firstEvent, secondEvent]) {
      sendJson(ws, ["EVENT", event], trace);
      await waitForMessage(ws, 3_000, trace);
    }

    sendJson(
      ws,
      [
        "CHANGES",
        "doc-filter",
        {
          mode: "tail",
          since: 0,
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: ["author-1"],
          "#d": ["doc-2"],
        },
      ],
      trace,
    );

    expect(await waitForMessages(ws, 2, 3_000, trace)).toEqual([
      ["CHANGES", "doc-filter", "EVENT", 2, secondEvent],
      ["CHANGES", "doc-filter", "EOSE", 2],
    ]);
  });

  test("bootstrap returns only nondominated current snapshots for one document", async () => {
    const ctx = await startTestSnapshotRelay(39464);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const staleEvent = snapshotEvent(
      "snapshot-stale",
      1_700_000_000_000,
      [],
      "doc-1",
      "put",
      "author-1",
      { "DEVICE-A": 1 },
    );
    const currentLeft = snapshotEvent(
      "snapshot-left",
      1_700_000_000_100,
      [],
      "doc-1",
      "put",
      "author-1",
      { "DEVICE-A": 2 },
    );
    const currentRight = snapshotEvent(
      "snapshot-right",
      1_700_000_000_200,
      [],
      "doc-1",
      "put",
      "author-1",
      { "DEVICE-B": 1 },
    );

    for (const event of [staleEvent, currentLeft, currentRight]) {
      sendJson(ws, ["EVENT", event], trace);
      await waitForMessage(ws, 3_000, trace);
    }

    sendJson(
      ws,
      [
        "CHANGES",
        "bootstrap-current",
        {
          mode: "bootstrap",
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: ["author-1"],
        },
      ],
      trace,
    );

    expect(await waitForMessages(ws, 4, 3_000, trace)).toEqual([
      [
        "CHANGES",
        "bootstrap-current",
        "STATUS",
        { mode: "bootstrap", snapshot_seq: 3 },
      ],
      ["CHANGES", "bootstrap-current", "SNAPSHOT", currentLeft],
      ["CHANGES", "bootstrap-current", "SNAPSHOT", currentRight],
      ["CHANGES", "bootstrap-current", "EOSE", 3],
    ]);
  });

  test("streams live CHANGES events after the initial EOSE", async () => {
    const ctx = await startTestSnapshotRelay(39418);
    contexts.push(ctx);

    const subscriberTrace = traceOptions(ctx, "subscriber");
    const publisherTrace = traceOptions(ctx, "publisher");
    const subscriber = await connectWs(ctx.port, subscriberTrace);
    const publisher = await connectWs(ctx.port, publisherTrace);

    sendJson(
      subscriber,
      [
        "CHANGES",
        "live-1",
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
    expect(await waitForMessage(subscriber, 3_000, subscriberTrace)).toEqual([
      "CHANGES",
      "live-1",
      "EOSE",
      0,
    ]);

    const event = snapshotEvent(REV_A);
    const livePromise = waitForMessage(subscriber, 3_000, subscriberTrace);
    sendJson(publisher, ["EVENT", event], publisherTrace);

    expect(await waitForMessage(publisher, 3_000, publisherTrace)).toEqual([
      "OK",
      event.id,
      true,
      `stored: snapshot ${event.id}`,
    ]);
    expect(await livePromise).toEqual(["CHANGES", "live-1", "EVENT", 1, event]);
  });

  test("removes a live CHANGES subscription after CLOSE", async () => {
    const ctx = await startTestSnapshotRelay(39433);
    contexts.push(ctx);

    const subscriberTrace = traceOptions(ctx, "subscriber");
    const publisherTrace = traceOptions(ctx, "publisher");
    const subscriber = await connectWs(ctx.port, subscriberTrace);
    const publisher = await connectWs(ctx.port, publisherTrace);

    sendJson(
      subscriber,
      [
        "CHANGES",
        "live-close",
        {
          since: 0,
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: ["author-1"],
          live: true,
        },
      ],
      subscriberTrace,
    );
    expect(await waitForMessage(subscriber, 3_000, subscriberTrace)).toEqual([
      "CHANGES",
      "live-close",
      "EOSE",
      0,
    ]);

    sendJson(subscriber, ["CLOSE", "live-close"], subscriberTrace);
    expect(await waitForMessage(subscriber, 3_000, subscriberTrace)).toEqual([
      "CLOSED",
      "live-close",
      "closed",
    ]);

    const event = snapshotEvent(REV_A);
    sendJson(publisher, ["EVENT", event], publisherTrace);
    expect(await waitForMessage(publisher, 3_000, publisherTrace)).toEqual([
      "OK",
      event.id,
      true,
      `stored: snapshot ${event.id}`,
    ]);

    await expectNoMessage(subscriber, 300, subscriberTrace);
  });

  test("returns CHANGES ERR when the authors filter is missing", async () => {
    const ctx = await startTestSnapshotRelay(39442);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);

    sendJson(
      ws,
      [
        "CHANGES",
        "bad-scope",
        { mode: "tail", since: 0, kinds: [SNAPSHOT_SYNC_EVENT_KIND] },
      ],
      trace,
    );

    expect(await waitForMessage(ws, 3_000, trace)).toEqual([
      "CHANGES",
      "bad-scope",
      "ERR",
      "snapshot CHANGES currently requires exactly one author",
    ]);
  });

  test("returns CHANGES ERR when multiple authors are requested", async () => {
    const ctx = await startTestSnapshotRelay(39443);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);

    sendJson(
      ws,
      [
        "CHANGES",
        "bad-scope-multi",
        {
          mode: "tail",
          since: 0,
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: ["author-1", "author-2"],
        },
      ],
      trace,
    );

    expect(await waitForMessage(ws, 3_000, trace)).toEqual([
      "CHANGES",
      "bad-scope-multi",
      "ERR",
      "snapshot CHANGES currently requires exactly one author",
    ]);
  });

  test("returns CLOSED when CLOSE is used on a non-live subscription id", async () => {
    const ctx = await startTestSnapshotRelay(39447);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);

    sendJson(ws, ["CLOSE", "missing-subscription"], trace);
    expect(await waitForMessage(ws, 3_000, trace)).toEqual([
      "CLOSED",
      "missing-subscription",
      "closed",
    ]);
  });

  test("assigns monotonic seq values when two clients publish different documents", async () => {
    const ctx = await startTestSnapshotRelay(39450);
    contexts.push(ctx);

    const leftTrace = traceOptions(ctx, "left");
    const rightTrace = traceOptions(ctx, "right");
    const readerTrace = traceOptions(ctx, "reader");
    const leftWs = await connectWs(ctx.port, leftTrace);
    const rightWs = await connectWs(ctx.port, rightTrace);
    const readerWs = await connectWs(ctx.port, readerTrace);

    const leftEvent = snapshotEvent(REV_A, 1_700_000_000_200, [], "doc-left");
    const rightEvent = snapshotEvent(REV_B, 1_700_000_000_100, [], "doc-right");

    sendJson(leftWs, ["EVENT", leftEvent], leftTrace);
    sendJson(rightWs, ["EVENT", rightEvent], rightTrace);
    await waitForMessage(leftWs, 3_000, leftTrace);
    await waitForMessage(rightWs, 3_000, rightTrace);

    sendJson(
      readerWs,
      [
        "CHANGES",
        "all-docs",
        {
          mode: "tail",
          since: 0,
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: ["author-1"],
        },
      ],
      readerTrace,
    );

    const messages = await waitForMessages(readerWs, 3, 3_000, readerTrace);
    expect(messages).toHaveLength(3);
    expect(messages[2]).toEqual(["CHANGES", "all-docs", "EOSE", 2]);
    expect(messages[0][3]).toBe(1);
    expect(messages[1][3]).toBe(2);

    const seenEventIds = new Set([
      (messages[0][4] as { id: string }).id,
      (messages[1][4] as { id: string }).id,
    ]);
    expect(seenEventIds).toEqual(new Set([leftEvent.id, rightEvent.id]));
  });

  test("broadcasts the same live change to multiple subscribers", async () => {
    const ctx = await startTestSnapshotRelay(39452);
    contexts.push(ctx);

    const leftTrace = traceOptions(ctx, "left-subscriber");
    const rightTrace = traceOptions(ctx, "right-subscriber");
    const publisherTrace = traceOptions(ctx, "publisher");
    const leftWs = await connectWs(ctx.port, leftTrace);
    const rightWs = await connectWs(ctx.port, rightTrace);
    const publisherWs = await connectWs(ctx.port, publisherTrace);

    for (const [ws, trace, subscriptionId] of [
      [leftWs, leftTrace, "left-live"] as const,
      [rightWs, rightTrace, "right-live"] as const,
    ]) {
      sendJson(
        ws,
        [
          "CHANGES",
          subscriptionId,
          {
            mode: "tail",
            since: 0,
            kinds: [SNAPSHOT_SYNC_EVENT_KIND],
            authors: ["author-1"],
            live: true,
          },
        ],
        trace,
      );
      expect(await waitForMessage(ws, 3_000, trace)).toEqual([
        "CHANGES",
        subscriptionId,
        "EOSE",
        0,
      ]);
    }

    const event = snapshotEvent(REV_A);
    const leftEventPromise = waitForMessage(leftWs, 3_000, leftTrace);
    const rightEventPromise = waitForMessage(rightWs, 3_000, rightTrace);

    sendJson(publisherWs, ["EVENT", event], publisherTrace);
    await waitForMessage(publisherWs, 3_000, publisherTrace);

    expect(await leftEventPromise).toEqual([
      "CHANGES",
      "left-live",
      "EVENT",
      1,
      event,
    ]);
    expect(await rightEventPromise).toEqual([
      "CHANGES",
      "right-live",
      "EVENT",
      1,
      event,
    ]);
  });

  test("replaces an existing live subscription when the same subscription id is reused on one socket", async () => {
    const ctx = await startTestSnapshotRelay(39471);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const publisherTrace = traceOptions(ctx, "publisher");
    const ws = await connectWs(ctx.port, trace);
    const publisherWs = await connectWs(ctx.port, publisherTrace);

    sendJson(
      ws,
      [
        "CHANGES",
        "dup-live",
        {
          mode: "tail",
          since: 0,
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: ["author-1"],
          "#d": ["doc-1"],
          live: true,
        },
      ],
      trace,
    );
    expect(await waitForMessage(ws, 3_000, trace)).toEqual([
      "CHANGES",
      "dup-live",
      "EOSE",
      0,
    ]);

    sendJson(
      ws,
      [
        "CHANGES",
        "dup-live",
        {
          mode: "tail",
          since: 0,
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: ["author-1"],
          "#d": ["doc-2"],
          live: true,
        },
      ],
      trace,
    );
    expect(await waitForMessage(ws, 3_000, trace)).toEqual([
      "CHANGES",
      "dup-live",
      "EOSE",
      0,
    ]);

    const ignoredEvent = snapshotEvent(REV_A, 1_700_000_000_000, [], "doc-1");
    const deliveredEvent = snapshotEvent(REV_B, 1_700_000_000_100, [], "doc-2");

    sendJson(publisherWs, ["EVENT", ignoredEvent], publisherTrace);
    await waitForMessage(publisherWs, 3_000, publisherTrace);
    await expectNoMessage(ws, 300, trace);

    const deliveredPromise = waitForMessage(ws, 3_000, trace);
    sendJson(publisherWs, ["EVENT", deliveredEvent], publisherTrace);
    await waitForMessage(publisherWs, 3_000, publisherTrace);
    expect(await deliveredPromise).toEqual([
      "CHANGES",
      "dup-live",
      "EVENT",
      2,
      deliveredEvent,
    ]);
  });

  test("replays missed changes after a subscriber disconnects and reconnects", async () => {
    const ctx = await startTestSnapshotRelay(39453);
    contexts.push(ctx);

    const firstTrace = traceOptions(ctx, "first-client");
    const publisherTrace = traceOptions(ctx, "publisher");
    const reconnectTrace = traceOptions(ctx, "reconnect-client");
    const firstWs = await connectWs(ctx.port, firstTrace);
    const publisherWs = await connectWs(ctx.port, publisherTrace);

    sendJson(
      firstWs,
      [
        "CHANGES",
        "live-reconnect",
        {
          mode: "tail",
          since: 0,
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: ["author-1"],
          live: true,
        },
      ],
      firstTrace,
    );
    expect(await waitForMessage(firstWs, 3_000, firstTrace)).toEqual([
      "CHANGES",
      "live-reconnect",
      "EOSE",
      0,
    ]);

    firstWs.close();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const event = snapshotEvent(REV_A);
    sendJson(publisherWs, ["EVENT", event], publisherTrace);
    await waitForMessage(publisherWs, 3_000, publisherTrace);

    const reconnectWs = await connectWs(ctx.port, reconnectTrace);
    sendJson(
      reconnectWs,
      [
        "CHANGES",
        "catchup",
        {
          mode: "tail",
          since: 0,
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: ["author-1"],
        },
      ],
      reconnectTrace,
    );

    expect(
      await waitForMessages(reconnectWs, 2, 3_000, reconnectTrace),
    ).toEqual([
      ["CHANGES", "catchup", "EVENT", 1, event],
      ["CHANGES", "catchup", "EOSE", 1],
    ]);
  });

  test("replays only later changes when reconnecting with a nonzero since cursor", async () => {
    const ctx = await startTestSnapshotRelay(39465);
    contexts.push(ctx);

    const firstTrace = traceOptions(ctx, "first-client");
    const publisherTrace = traceOptions(ctx, "publisher");
    const reconnectTrace = traceOptions(ctx, "reconnect-client");
    const firstWs = await connectWs(ctx.port, firstTrace);
    const publisherWs = await connectWs(ctx.port, publisherTrace);

    sendJson(
      firstWs,
      [
        "CHANGES",
        "live-since",
        {
          mode: "tail",
          since: 0,
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: ["author-1"],
          live: true,
        },
      ],
      firstTrace,
    );
    expect(await waitForMessage(firstWs, 3_000, firstTrace)).toEqual([
      "CHANGES",
      "live-since",
      "EOSE",
      0,
    ]);

    const firstEvent = snapshotEvent(REV_A);
    const firstLiveEvent = waitForMessage(firstWs, 3_000, firstTrace);
    sendJson(publisherWs, ["EVENT", firstEvent], publisherTrace);
    await waitForMessage(publisherWs, 3_000, publisherTrace);
    expect(await firstLiveEvent).toEqual([
      "CHANGES",
      "live-since",
      "EVENT",
      1,
      firstEvent,
    ]);

    firstWs.close();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const secondEvent = snapshotEvent(REV_B, 1_700_000_000_100, [REV_A]);
    sendJson(publisherWs, ["EVENT", secondEvent], publisherTrace);
    await waitForMessage(publisherWs, 3_000, publisherTrace);

    const reconnectWs = await connectWs(ctx.port, reconnectTrace);
    sendJson(
      reconnectWs,
      [
        "CHANGES",
        "catchup-since-1",
        {
          mode: "tail",
          since: 1,
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: ["author-1"],
        },
      ],
      reconnectTrace,
    );

    expect(
      await waitForMessages(reconnectWs, 2, 3_000, reconnectTrace),
    ).toEqual([
      ["CHANGES", "catchup-since-1", "EVENT", 2, secondEvent],
      ["CHANGES", "catchup-since-1", "EOSE", 2],
    ]);
  });

  test("removes live subscriptions when the websocket closes", async () => {
    const ctx = await startTestSnapshotRelay(39466);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);

    sendJson(
      ws,
      [
        "CHANGES",
        "live-close-socket",
        {
          mode: "tail",
          since: 0,
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: ["author-1"],
          live: true,
        },
      ],
      trace,
    );
    await waitForMessage(ws, 3_000, trace);

    expect(ctx.connectionCount()).toBe(1);
    ws.close();

    await waitFor(() => ctx.connectionCount() === 0, {
      context: ctx,
      label: "live websocket close cleanup",
    });
  });
});
