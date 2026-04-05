import { afterEach, describe, expect, test } from "bun:test";

import {
  connectWs,
  sendJson,
  startTestSnapshotRelay,
  waitForMessage,
  type SnapshotRelayTestContext,
} from "../helpers";
import {
  REV_A,
  REV_B,
  cleanupContexts,
  snapshotEvent,
  traceOptions,
} from "./fixtures";

describe("relay integration > publish", () => {
  const contexts: SnapshotRelayTestContext[] = [];

  afterEach(async () => {
    await cleanupContexts(contexts);
  });

  test("returns NOTICE for malformed JSON input", async () => {
    const ctx = await startTestSnapshotRelay(39436);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);

    ctx.log(`${trace.label} -> <raw malformed json>`);
    ws.send("{");

    expect(await waitForMessage(ws, 3_000, trace)).toEqual([
      "NOTICE",
      "invalid: expected a JSON array message",
    ]);
  });

  test("returns NOTICE for non-array JSON input", async () => {
    const ctx = await startTestSnapshotRelay(39437);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);

    ctx.log(`${trace.label} -> <raw object json>`);
    ws.send(JSON.stringify({ kind: "not-an-array" }));

    expect(await waitForMessage(ws, 3_000, trace)).toEqual([
      "NOTICE",
      "invalid: expected a JSON array message",
    ]);
  });

  test("rejects binary websocket messages with NOTICE", async () => {
    const ctx = await startTestSnapshotRelay(39438);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);

    ctx.log(`${trace.label} -> <binary 3 bytes>`);
    ws.send(new Uint8Array([1, 2, 3]));

    expect(await waitForMessage(ws, 3_000, trace)).toEqual([
      "NOTICE",
      "invalid: binary messages unsupported",
    ]);
  });

  test("returns duplicate response when the same snapshot is published twice", async () => {
    const ctx = await startTestSnapshotRelay(39431);
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

    sendJson(ws, ["EVENT", event], trace);
    expect(await waitForMessage(ws, 3_000, trace)).toEqual([
      "OK",
      event.id,
      false,
      "duplicate: snapshot already exists",
    ]);
  });

  test("rejects unsupported non-snapshot event kinds", async () => {
    const ctx = await startTestSnapshotRelay(39439);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const event = {
      id: "generic-event-1",
      pubkey: "sender-1",
      created_at: 1_700_000_000,
      kind: 1,
      tags: [],
      content: "hello",
      sig: "sig-generic-1",
    };

    sendJson(ws, ["EVENT", event], trace);
    expect(await waitForMessage(ws, 3_000, trace)).toEqual([
      "OK",
      event.id,
      false,
      "unsupported: non-snapshot event kind requires explicit classification",
    ]);
  });

  test("rejects snapshot events with malformed metadata", async () => {
    const ctx = await startTestSnapshotRelay(39440);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const invalidEvent = {
      ...snapshotEvent(REV_A),
      id: "event-invalid-snapshot",
      tags: [
        ["d", "doc-1"],
        ["op", "put"],
        ["c", "notes"],
      ],
    };

    sendJson(ws, ["EVENT", invalidEvent], trace);
    expect(await waitForMessage(ws, 3_000, trace)).toEqual([
      "OK",
      invalidEvent.id,
      false,
      "invalid: missing or malformed snapshot metadata",
    ]);
  });

  test("rejects snapshot events with malformed operation tags", async () => {
    const ctx = await startTestSnapshotRelay(39441);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const invalidEvent = {
      ...snapshotEvent(REV_B),
      id: "event-invalid-prev",
      tags: [
        ["d", "doc-1"],
        ["o", "merge"],
        ["c", "notes"],
      ],
    };

    sendJson(ws, ["EVENT", invalidEvent], trace);
    expect(await waitForMessage(ws, 3_000, trace)).toEqual([
      "OK",
      invalidEvent.id,
      false,
      "invalid: missing or malformed snapshot metadata",
    ]);
  });
});
