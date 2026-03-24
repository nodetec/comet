import { afterEach, describe, expect, test } from "bun:test";

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

describe("relay integration > publish", () => {
  const contexts: RevisionRelayTestContext[] = [];

  afterEach(async () => {
    await cleanupContexts(contexts);
  });

  test("returns NOTICE for malformed JSON input", async () => {
    const ctx = await startTestRevisionRelay(39436);
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
    const ctx = await startTestRevisionRelay(39437);
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
    const ctx = await startTestRevisionRelay(39438);
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

  test("returns duplicate response when the same revision is published twice", async () => {
    const ctx = await startTestRevisionRelay(39431);
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

    sendJson(ws, ["EVENT", event], trace);
    expect(await waitForMessage(ws, 3_000, trace)).toEqual([
      "OK",
      event.id,
      false,
      "duplicate: revision already exists",
    ]);
  });

  test("rejects unsupported non-revision event kinds", async () => {
    const ctx = await startTestRevisionRelay(39439);
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
      "unsupported: non-revision event kind requires explicit classification",
    ]);
  });

  test("rejects revision events with malformed metadata", async () => {
    const ctx = await startTestRevisionRelay(39440);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const invalidEvent = {
      ...revisionEvent(REV_A),
      id: "event-invalid-revision",
      tags: [
        ["p", "recipient-1"],
        ["d", "doc-1"],
        ["op", "put"],
        ["m", "1700000000000"],
        ["type", "note"],
        ["v", "2"],
      ],
    };

    sendJson(ws, ["EVENT", invalidEvent], trace);
    expect(await waitForMessage(ws, 3_000, trace)).toEqual([
      "OK",
      invalidEvent.id,
      false,
      "invalid: missing or malformed revision metadata",
    ]);
  });

  test("rejects revision events with malformed prev values", async () => {
    const ctx = await startTestRevisionRelay(39441);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const invalidEvent = {
      ...revisionEvent(REV_B),
      id: "event-invalid-prev",
      tags: [
        ["p", "recipient-1"],
        ["d", "doc-1"],
        ["r", REV_B],
        ["prev", "not-hex"],
        ["op", "put"],
        ["m", "1700000000000"],
        ["type", "note"],
        ["v", "2"],
      ],
    };

    sendJson(ws, ["EVENT", invalidEvent], trace);
    expect(await waitForMessage(ws, 3_000, trace)).toEqual([
      "OK",
      invalidEvent.id,
      false,
      "invalid: missing or malformed revision metadata",
    ]);
  });
});
