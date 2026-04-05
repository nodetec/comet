import { afterEach, describe, expect, test } from "bun:test";

import { REVISION_SYNC_EVENT_KIND } from "../../src/types";
import {
  connectWs,
  sendJson,
  startTestRevisionRelay,
  waitFor,
  waitForNegentropyConvergence,
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

describe("relay integration > negentropy", () => {
  const contexts: RevisionRelayTestContext[] = [];

  afterEach(async () => {
    await cleanupContexts(contexts);
  });

  test("returns relay-local NEG-STATUS snapshots per relay instance", async () => {
    const left = await startTestRevisionRelay(39411);
    const right = await startTestRevisionRelay(39412);
    contexts.push(left, right);

    const leftTrace = traceOptions(left, "left");
    const rightTrace = traceOptions(right, "right");
    const leftWs = await connectWs(left.port, leftTrace);
    const rightWs = await connectWs(right.port, rightTrace);

    const event = revisionEvent(REV_B);
    const leftOkPromise = waitForMessage(leftWs, 3_000, leftTrace);
    const rightOkPromise = waitForMessage(rightWs, 3_000, rightTrace);
    sendJson(leftWs, ["EVENT", event], leftTrace);
    sendJson(rightWs, ["EVENT", event], rightTrace);
    await leftOkPromise;
    await rightOkPromise;

    const leftNegPromise = waitForMessage(leftWs, 3_000, leftTrace);
    const rightNegPromise = waitForMessage(rightWs, 3_000, rightTrace);

    sendJson(
      leftWs,
      [
        "NEG-OPEN",
        "neg-left",
        { kinds: [REVISION_SYNC_EVENT_KIND], authors: ["recipient-1"] },
      ],
      leftTrace,
    );
    sendJson(
      rightWs,
      [
        "NEG-OPEN",
        "neg-right",
        { kinds: [REVISION_SYNC_EVENT_KIND], authors: ["recipient-1"] },
      ],
      rightTrace,
    );

    expect(await leftNegPromise).toEqual([
      "NEG-STATUS",
      "neg-left",
      { strategy: "revision-sync.v1", snapshot_seq: 1 },
    ]);
    expect(await rightNegPromise).toEqual([
      "NEG-STATUS",
      "neg-right",
      { strategy: "revision-sync.v1", snapshot_seq: 1 },
    ]);
  });

  test("responds to NEG-MSG using current materialized heads", async () => {
    const ctx = await startTestRevisionRelay(39413);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const event = revisionEvent(REV_A);

    sendJson(ws, ["EVENT", event], trace);
    await waitForMessage(ws, 3_000, trace);

    sendJson(
      ws,
      [
        "NEG-OPEN",
        "neg-sync",
        { kinds: [REVISION_SYNC_EVENT_KIND], authors: ["recipient-1"] },
      ],
      trace,
    );
    expect(await waitForMessage(ws, 3_000, trace)).toEqual([
      "NEG-STATUS",
      "neg-sync",
      { strategy: "revision-sync.v1", snapshot_seq: 1 },
    ]);

    const result = await waitForNegentropyConvergence(
      ws,
      "neg-sync",
      [],
      trace,
    );
    expect(result.need).toEqual([REV_A]);
    expect(result.have).toEqual([]);
  });

  test("returns NEG-ERR for an unknown negentropy session", async () => {
    const ctx = await startTestRevisionRelay(39416);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);

    sendJson(ws, ["NEG-MSG", "missing-session", "00"], trace);
    expect(await waitForMessage(ws, 3_000, trace)).toEqual([
      "NEG-ERR",
      "missing-session",
      "unknown negentropy session: missing-session",
    ]);
  });

  test("returns NEG-ERR when NEG-OPEN omits the required author scope", async () => {
    const ctx = await startTestRevisionRelay(39444);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);

    sendJson(
      ws,
      ["NEG-OPEN", "neg-no-author", { kinds: [REVISION_SYNC_EVENT_KIND] }],
      trace,
    );

    expect(await waitForMessage(ws, 3_000, trace)).toEqual([
      "NEG-ERR",
      "neg-no-author",
      "NEG-OPEN requires exactly one author for revision sync",
    ]);
  });

  test("returns NEG-ERR when NEG-OPEN uses multiple authors", async () => {
    const ctx = await startTestRevisionRelay(39445);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);

    sendJson(
      ws,
      [
        "NEG-OPEN",
        "neg-multi-author",
        {
          kinds: [REVISION_SYNC_EVENT_KIND],
          authors: ["recipient-1", "recipient-2"],
        },
      ],
      trace,
    );

    expect(await waitForMessage(ws, 3_000, trace)).toEqual([
      "NEG-ERR",
      "neg-multi-author",
      "NEG-OPEN requires exactly one author for revision sync",
    ]);
  });

  test("allows NEG-CLOSE to be called twice without crashing", async () => {
    const ctx = await startTestRevisionRelay(39446);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);

    sendJson(
      ws,
      [
        "NEG-OPEN",
        "neg-close-twice",
        { kinds: [REVISION_SYNC_EVENT_KIND], authors: ["recipient-1"] },
      ],
      trace,
    );
    await waitForMessage(ws, 3_000, trace);

    sendJson(ws, ["NEG-CLOSE", "neg-close-twice"], trace);
    expect(await waitForMessage(ws, 3_000, trace)).toEqual([
      "CLOSED",
      "neg-close-twice",
      "negentropy session closed",
    ]);

    sendJson(ws, ["NEG-CLOSE", "neg-close-twice"], trace);
    expect(await waitForMessage(ws, 3_000, trace)).toEqual([
      "CLOSED",
      "neg-close-twice",
      "negentropy session closed",
    ]);
  });

  test("removes the connection when a websocket closes during an active Negentropy session", async () => {
    const ctx = await startTestRevisionRelay(39472);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);

    sendJson(
      ws,
      [
        "NEG-OPEN",
        "neg-close-socket",
        { kinds: [REVISION_SYNC_EVENT_KIND], authors: ["recipient-1"] },
      ],
      trace,
    );
    expect(await waitForMessage(ws, 3_000, trace)).toEqual([
      "NEG-STATUS",
      "neg-close-socket",
      { strategy: "revision-sync.v1", snapshot_seq: 0 },
    ]);

    expect(ctx.connectionCount()).toBe(1);
    ws.close();

    await waitFor(() => ctx.connectionCount() === 0, {
      context: ctx,
      label: "negentropy websocket close cleanup",
    });

    const reconnectTrace = traceOptions(ctx, "reconnect");
    const reconnectWs = await connectWs(ctx.port, reconnectTrace);
    sendJson(
      reconnectWs,
      [
        "NEG-OPEN",
        "neg-close-socket",
        { kinds: [REVISION_SYNC_EVENT_KIND], authors: ["recipient-1"] },
      ],
      reconnectTrace,
    );
    expect(await waitForMessage(reconnectWs, 3_000, reconnectTrace)).toEqual([
      "NEG-STATUS",
      "neg-close-socket",
      { strategy: "revision-sync.v1", snapshot_seq: 0 },
    ]);
  });
});
