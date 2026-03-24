import { afterEach, describe, expect, test } from "bun:test";

import { REVISION_SYNC_EVENT_KIND } from "../../src/types";
import {
  connectWs,
  expectNoMessage,
  sendJson,
  startTestRevisionRelay,
  waitFor,
  waitForMessage,
  waitForMessages,
  type RevisionRelayTestContext,
} from "../helpers";
import {
  REV_A,
  REV_B,
  cleanupContexts,
  revisionEvent,
  traceOptions,
} from "./fixtures";

describe("relay integration > changes", () => {
  const contexts: RevisionRelayTestContext[] = [];

  afterEach(async () => {
    await cleanupContexts(contexts);
  });

  test("stores a revision event and replays it through CHANGES", async () => {
    const ctx = await startTestRevisionRelay(39410);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const event = revisionEvent(REV_A);

    sendJson(ws, ["EVENT", event], trace);
    expect(await waitForMessage(ws, 3_000, trace)).toEqual([
      "OK",
      event.id,
      true,
      `stored: revision ${REV_A}`,
    ]);

    sendJson(
      ws,
      [
        "CHANGES",
        "sync-1",
        { since: 0, kinds: [REVISION_SYNC_EVENT_KIND], "#p": ["recipient-1"] },
      ],
      trace,
    );

    expect(await waitForMessages(ws, 2, 3_000, trace)).toEqual([
      ["CHANGES", "sync-1", "EVENT", 1, event],
      ["CHANGES", "sync-1", "EOSE", 1],
    ]);
  });

  test("filters CHANGES replay by document id", async () => {
    const ctx = await startTestRevisionRelay(39463);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const firstEvent = revisionEvent(REV_A, 1_700_000_000_000, [], "doc-1");
    const secondEvent = revisionEvent(REV_B, 1_700_000_000_100, [], "doc-2");

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
          since: 0,
          kinds: [REVISION_SYNC_EVENT_KIND],
          "#p": ["recipient-1"],
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

  test("filters CHANGES replay by revision id", async () => {
    const ctx = await startTestRevisionRelay(39464);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const firstEvent = revisionEvent(REV_A, 1_700_000_000_000, [], "doc-1");
    const secondEvent = revisionEvent(REV_B, 1_700_000_000_100, [], "doc-1");

    for (const event of [firstEvent, secondEvent]) {
      sendJson(ws, ["EVENT", event], trace);
      await waitForMessage(ws, 3_000, trace);
    }

    sendJson(
      ws,
      [
        "CHANGES",
        "rev-filter",
        {
          since: 0,
          kinds: [REVISION_SYNC_EVENT_KIND],
          "#p": ["recipient-1"],
          "#r": [REV_B],
        },
      ],
      trace,
    );

    expect(await waitForMessages(ws, 2, 3_000, trace)).toEqual([
      ["CHANGES", "rev-filter", "EVENT", 2, secondEvent],
      ["CHANGES", "rev-filter", "EOSE", 2],
    ]);
  });

  test("streams live CHANGES events after the initial EOSE", async () => {
    const ctx = await startTestRevisionRelay(39418);
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
          since: 0,
          kinds: [REVISION_SYNC_EVENT_KIND],
          "#p": ["recipient-1"],
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

    const event = revisionEvent(REV_A);
    const livePromise = waitForMessage(subscriber, 3_000, subscriberTrace);
    sendJson(publisher, ["EVENT", event], publisherTrace);

    expect(await waitForMessage(publisher, 3_000, publisherTrace)).toEqual([
      "OK",
      event.id,
      true,
      `stored: revision ${REV_A}`,
    ]);
    expect(await livePromise).toEqual(["CHANGES", "live-1", "EVENT", 1, event]);
  });

  test("removes a live CHANGES subscription after CLOSE", async () => {
    const ctx = await startTestRevisionRelay(39433);
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
          kinds: [REVISION_SYNC_EVENT_KIND],
          "#p": ["recipient-1"],
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

    const event = revisionEvent(REV_A);
    sendJson(publisher, ["EVENT", event], publisherTrace);
    expect(await waitForMessage(publisher, 3_000, publisherTrace)).toEqual([
      "OK",
      event.id,
      true,
      `stored: revision ${REV_A}`,
    ]);

    await expectNoMessage(subscriber, 300, subscriberTrace);
  });

  test("returns CHANGES ERR when #p recipient is missing", async () => {
    const ctx = await startTestRevisionRelay(39442);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);

    sendJson(
      ws,
      ["CHANGES", "bad-scope", { since: 0, kinds: [REVISION_SYNC_EVENT_KIND] }],
      trace,
    );

    expect(await waitForMessage(ws, 3_000, trace)).toEqual([
      "CHANGES",
      "bad-scope",
      "ERR",
      "revision CHANGES currently requires exactly one #p recipient",
    ]);
  });

  test("returns CHANGES ERR when multiple #p recipients are requested", async () => {
    const ctx = await startTestRevisionRelay(39443);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);

    sendJson(
      ws,
      [
        "CHANGES",
        "bad-scope-multi",
        {
          since: 0,
          kinds: [REVISION_SYNC_EVENT_KIND],
          "#p": ["recipient-1", "recipient-2"],
        },
      ],
      trace,
    );

    expect(await waitForMessage(ws, 3_000, trace)).toEqual([
      "CHANGES",
      "bad-scope-multi",
      "ERR",
      "revision CHANGES currently requires exactly one #p recipient",
    ]);
  });

  test("returns CLOSED when CLOSE is used on a non-live subscription id", async () => {
    const ctx = await startTestRevisionRelay(39447);
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
    const ctx = await startTestRevisionRelay(39450);
    contexts.push(ctx);

    const leftTrace = traceOptions(ctx, "left");
    const rightTrace = traceOptions(ctx, "right");
    const readerTrace = traceOptions(ctx, "reader");
    const leftWs = await connectWs(ctx.port, leftTrace);
    const rightWs = await connectWs(ctx.port, rightTrace);
    const readerWs = await connectWs(ctx.port, readerTrace);

    const leftEvent = revisionEvent(REV_A, 1_700_000_000_200, [], "doc-left");
    const rightEvent = revisionEvent(REV_B, 1_700_000_000_100, [], "doc-right");

    sendJson(leftWs, ["EVENT", leftEvent], leftTrace);
    sendJson(rightWs, ["EVENT", rightEvent], rightTrace);
    await waitForMessage(leftWs, 3_000, leftTrace);
    await waitForMessage(rightWs, 3_000, rightTrace);

    sendJson(
      readerWs,
      [
        "CHANGES",
        "all-docs",
        { since: 0, kinds: [REVISION_SYNC_EVENT_KIND], "#p": ["recipient-1"] },
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
    const ctx = await startTestRevisionRelay(39452);
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
            since: 0,
            kinds: [REVISION_SYNC_EVENT_KIND],
            "#p": ["recipient-1"],
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

    const event = revisionEvent(REV_A);
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
    const ctx = await startTestRevisionRelay(39471);
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
          since: 0,
          kinds: [REVISION_SYNC_EVENT_KIND],
          "#p": ["recipient-1"],
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
          since: 0,
          kinds: [REVISION_SYNC_EVENT_KIND],
          "#p": ["recipient-1"],
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

    const ignoredEvent = revisionEvent(REV_A, 1_700_000_000_000, [], "doc-1");
    const deliveredEvent = revisionEvent(REV_B, 1_700_000_000_100, [], "doc-2");

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
    const ctx = await startTestRevisionRelay(39453);
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
          since: 0,
          kinds: [REVISION_SYNC_EVENT_KIND],
          "#p": ["recipient-1"],
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

    const event = revisionEvent(REV_A);
    sendJson(publisherWs, ["EVENT", event], publisherTrace);
    await waitForMessage(publisherWs, 3_000, publisherTrace);

    const reconnectWs = await connectWs(ctx.port, reconnectTrace);
    sendJson(
      reconnectWs,
      [
        "CHANGES",
        "catchup",
        {
          since: 0,
          kinds: [REVISION_SYNC_EVENT_KIND],
          "#p": ["recipient-1"],
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
    const ctx = await startTestRevisionRelay(39465);
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
          since: 0,
          kinds: [REVISION_SYNC_EVENT_KIND],
          "#p": ["recipient-1"],
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

    const firstEvent = revisionEvent(REV_A);
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

    const secondEvent = revisionEvent(REV_B, 1_700_000_000_100, [REV_A]);
    sendJson(publisherWs, ["EVENT", secondEvent], publisherTrace);
    await waitForMessage(publisherWs, 3_000, publisherTrace);

    const reconnectWs = await connectWs(ctx.port, reconnectTrace);
    sendJson(
      reconnectWs,
      [
        "CHANGES",
        "catchup-since-1",
        {
          since: 1,
          kinds: [REVISION_SYNC_EVENT_KIND],
          "#p": ["recipient-1"],
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
    const ctx = await startTestRevisionRelay(39466);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);

    sendJson(
      ws,
      [
        "CHANGES",
        "live-close-socket",
        {
          since: 0,
          kinds: [REVISION_SYNC_EVENT_KIND],
          "#p": ["recipient-1"],
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
