import { afterEach, describe, expect, test } from "bun:test";

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
  REV_A,
  REV_B,
  cleanupContexts,
  snapshotEvent,
  traceOptions,
} from "./fixtures";

describe("relay integration > req", () => {
  const contexts: SnapshotRelayTestContext[] = [];

  afterEach(async () => {
    await cleanupContexts(contexts);
  });

  test("filters REQ by ids", async () => {
    const ctx = await startTestSnapshotRelay(39460);
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
        "REQ",
        "filter-ids",
        {
          ids: [secondEvent.id],
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
        },
      ],
      trace,
    );

    expect(await waitForMessages(ws, 2, 3_000, trace)).toEqual([
      ["EVENT", "filter-ids", secondEvent],
      ["EOSE", "filter-ids"],
    ]);
  });

  test("filters REQ by authors, kind, document, and event id together", async () => {
    const ctx = await startTestSnapshotRelay(39461);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const firstEvent = {
      ...snapshotEvent(REV_A, 1_700_000_000_000, [], "doc-1"),
      pubkey: "sender-a",
    };
    const secondEvent = {
      ...snapshotEvent(REV_B, 1_700_000_000_100, [], "doc-2"),
      pubkey: "sender-b",
    };

    for (const event of [firstEvent, secondEvent]) {
      sendJson(ws, ["EVENT", event], trace);
      await waitForMessage(ws, 3_000, trace);
    }

    sendJson(
      ws,
      [
        "REQ",
        "filter-combo",
        {
          ids: [secondEvent.id],
          authors: ["sender-b"],
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          "#d": ["doc-2"],
        },
      ],
      trace,
    );

    expect(await waitForMessages(ws, 2, 3_000, trace)).toEqual([
      ["EVENT", "filter-combo", secondEvent],
      ["EOSE", "filter-combo"],
    ]);
  });

  test("returns NOTICE for malformed REQ filters", async () => {
    const ctx = await startTestSnapshotRelay(39462);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);

    sendJson(ws, ["REQ", "bad-req", "not-an-object"], trace);
    expect(await waitForMessage(ws, 3_000, trace)).toEqual([
      "NOTICE",
      "invalid: REQ requires a string subscription id and object filters",
    ]);
  });

  test("returns batched snapshot events for REQ-BATCH", async () => {
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
        "REQ-BATCH",
        "filter-batch",
        {
          ids: [firstEvent.id, secondEvent.id],
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: ["author-1"],
        },
      ],
      trace,
    );

    expect(await waitForMessages(ws, 2, 3_000, trace)).toEqual([
      ["EVENTS", "filter-batch", [firstEvent, secondEvent]],
      ["EOSE", "filter-batch"],
    ]);
  });

  test("returns NOTICE for malformed REQ-BATCH filters", async () => {
    const ctx = await startTestSnapshotRelay(39464);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);

    sendJson(ws, ["REQ-BATCH", "bad-req-batch", "not-an-object"], trace);
    expect(await waitForMessage(ws, 3_000, trace)).toEqual([
      "NOTICE",
      "invalid: REQ-BATCH requires a string subscription id and object filters",
    ]);
  });
});
