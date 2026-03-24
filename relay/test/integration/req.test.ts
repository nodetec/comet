import { afterEach, describe, expect, test } from "bun:test";

import { REVISION_SYNC_EVENT_KIND } from "../../src/types";
import {
  connectWs,
  sendJson,
  startTestRevisionRelay,
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

describe("relay integration > req", () => {
  const contexts: RevisionRelayTestContext[] = [];

  afterEach(async () => {
    await cleanupContexts(contexts);
  });

  test("filters REQ by ids", async () => {
    const ctx = await startTestRevisionRelay(39460);
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
        "REQ",
        "filter-ids",
        {
          ids: [secondEvent.id],
          kinds: [REVISION_SYNC_EVENT_KIND],
        },
      ],
      trace,
    );

    expect(await waitForMessages(ws, 2, 3_000, trace)).toEqual([
      ["EVENT", "filter-ids", secondEvent],
      ["EOSE", "filter-ids"],
    ]);
  });

  test("filters REQ by authors, kind, recipient, document, and revision id together", async () => {
    const ctx = await startTestRevisionRelay(39461);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const firstEvent = {
      ...revisionEvent(REV_A, 1_700_000_000_000, [], "doc-1"),
      pubkey: "sender-a",
    };
    const secondEvent = {
      ...revisionEvent(REV_B, 1_700_000_000_100, [], "doc-2"),
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
          authors: ["sender-b"],
          kinds: [REVISION_SYNC_EVENT_KIND],
          "#p": ["recipient-1"],
          "#d": ["doc-2"],
          "#r": [REV_B],
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
    const ctx = await startTestRevisionRelay(39462);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);

    sendJson(ws, ["REQ", "bad-req", "not-an-object"], trace);
    expect(await waitForMessage(ws, 3_000, trace)).toEqual([
      "NOTICE",
      "invalid: REQ requires a string subscription id and object filters",
    ]);
  });
});
