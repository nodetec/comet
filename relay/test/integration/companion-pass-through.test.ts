import { afterEach, describe, expect, test } from "bun:test";
import { count } from "drizzle-orm";

import { createRevisionRelayDb } from "../../src/db";
import {
  relayEvents,
  syncChanges,
  syncRevisions,
} from "../../src/storage/schema";
import { REVISION_SYNC_EVENT_KIND } from "../../src/types";
import {
  connectWs,
  sendJson,
  startTestRevisionRelay,
  waitForNegentropyConvergence,
  waitForMessage,
  waitForMessages,
  type RevisionRelayTestContext,
} from "../helpers";
import { cleanupContexts, genericEvent, traceOptions } from "./fixtures";

describe("relay integration > companion/pass-through", () => {
  const contexts: RevisionRelayTestContext[] = [];

  afterEach(async () => {
    await cleanupContexts(contexts);
  });

  test("stores explicitly configured companion kinds without entering revision state", async () => {
    const ctx = await startTestRevisionRelay(39456, {
      companionKinds: [10002],
    });
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const event = genericEvent("companion-event-1", 10002, [
      ["p", "recipient-1"],
    ]);

    sendJson(ws, ["EVENT", event], trace);
    expect(await waitForMessage(ws, 3_000, trace)).toEqual([
      "OK",
      event.id,
      true,
      "stored: companion event kind=10002",
    ]);

    const { db, sql } = createRevisionRelayDb(ctx.databaseUrl);
    try {
      const [genericCountRow] = await db
        .select({ value: count() })
        .from(relayEvents);
      const [revisionCountRow] = await db
        .select({ value: count() })
        .from(syncRevisions);
      const [changeCountRow] = await db
        .select({ value: count() })
        .from(syncChanges);

      expect(genericCountRow.value).toBe(1);
      expect(revisionCountRow.value).toBe(0);
      expect(changeCountRow.value).toBe(0);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  test("stores explicitly configured pass-through kinds without entering revision state", async () => {
    const ctx = await startTestRevisionRelay(39457, {
      passThroughKinds: [1],
    });
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const event = genericEvent("pass-through-event-1", 1, [
      ["p", "recipient-1"],
    ]);

    sendJson(ws, ["EVENT", event], trace);
    expect(await waitForMessage(ws, 3_000, trace)).toEqual([
      "OK",
      event.id,
      true,
      "stored: pass-through event kind=1",
    ]);

    const { db, sql } = createRevisionRelayDb(ctx.databaseUrl);
    try {
      const [genericCountRow] = await db
        .select({ value: count() })
        .from(relayEvents);
      const [revisionCountRow] = await db
        .select({ value: count() })
        .from(syncRevisions);
      const [changeCountRow] = await db
        .select({ value: count() })
        .from(syncChanges);

      expect(genericCountRow.value).toBe(1);
      expect(revisionCountRow.value).toBe(0);
      expect(changeCountRow.value).toBe(0);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  test("returns duplicate semantics for configured companion events", async () => {
    const ctx = await startTestRevisionRelay(39458, {
      companionKinds: [10002],
    });
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const event = genericEvent("companion-event-duplicate", 10002);

    sendJson(ws, ["EVENT", event], trace);
    await waitForMessage(ws, 3_000, trace);

    sendJson(ws, ["EVENT", event], trace);
    expect(await waitForMessage(ws, 3_000, trace)).toEqual([
      "OK",
      event.id,
      false,
      "duplicate: event already exists",
    ]);
  });

  test("excludes configured generic kinds from revision CHANGES and Negentropy", async () => {
    const ctx = await startTestRevisionRelay(39459, {
      companionKinds: [10002],
      passThroughKinds: [1],
    });
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const companionEvent = genericEvent("companion-event-scope", 10002, [
      ["p", "recipient-1"],
    ]);
    const passThroughEvent = genericEvent("pass-through-event-scope", 1, [
      ["p", "recipient-1"],
    ]);

    sendJson(ws, ["EVENT", companionEvent], trace);
    await waitForMessage(ws, 3_000, trace);
    sendJson(ws, ["EVENT", passThroughEvent], trace);
    await waitForMessage(ws, 3_000, trace);

    sendJson(
      ws,
      [
        "CHANGES",
        "revision-only",
        { since: 0, kinds: [REVISION_SYNC_EVENT_KIND], "#p": ["recipient-1"] },
      ],
      trace,
    );
    expect(await waitForMessages(ws, 1, 3_000, trace)).toEqual([
      ["CHANGES", "revision-only", "EOSE", 0],
    ]);

    sendJson(
      ws,
      [
        "NEG-OPEN",
        "generic-scope",
        { kinds: [REVISION_SYNC_EVENT_KIND], "#p": ["recipient-1"] },
      ],
      trace,
    );
    expect(await waitForMessage(ws, 3_000, trace)).toEqual([
      "NEG-STATUS",
      "generic-scope",
      { strategy: "revision-sync.v1", snapshot_seq: 0 },
    ]);

    expect(
      await waitForNegentropyConvergence(ws, "generic-scope", [], trace),
    ).toEqual({ have: [], need: [] });
  });

  test("keeps live revision CHANGES isolated while generic traffic is interleaved", async () => {
    const ctx = await startTestRevisionRelay(39470, {
      companionKinds: [10002],
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
        "revision-live",
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
      "revision-live",
      "EOSE",
      0,
    ]);

    const revisionOne = genericEvent("ignored-generic-1", 10002, [
      ["p", "recipient-1"],
    ]);
    const revisionEventOne = genericEvent("ignored-generic-2", 1, [
      ["p", "recipient-1"],
    ]);
    const syncOne = genericEvent("revision-1", REVISION_SYNC_EVENT_KIND, [
      ["p", "recipient-1"],
      ["d", "doc-1"],
      ["r", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
      ["op", "put"],
      ["m", "1700000000000"],
      ["t", "note"],
      ["v", "2"],
    ]);
    const syncTwo = genericEvent("revision-2", REVISION_SYNC_EVENT_KIND, [
      ["p", "recipient-1"],
      ["d", "doc-1"],
      ["r", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
      [
        "prev",
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ],
      ["op", "put"],
      ["m", "1700000000100"],
      ["t", "note"],
      ["v", "2"],
    ]);

    const firstLive = waitForMessage(subscriber, 3_000, subscriberTrace);
    sendJson(publisher, ["EVENT", revisionOne], publisherTrace);
    await waitForMessage(publisher, 3_000, publisherTrace);
    sendJson(publisher, ["EVENT", syncOne], publisherTrace);
    await waitForMessage(publisher, 3_000, publisherTrace);
    expect(await firstLive).toEqual([
      "CHANGES",
      "revision-live",
      "EVENT",
      1,
      syncOne,
    ]);

    const secondLive = waitForMessage(subscriber, 3_000, subscriberTrace);
    sendJson(publisher, ["EVENT", revisionEventOne], publisherTrace);
    await waitForMessage(publisher, 3_000, publisherTrace);
    sendJson(publisher, ["EVENT", syncTwo], publisherTrace);
    await waitForMessage(publisher, 3_000, publisherTrace);
    expect(await secondLive).toEqual([
      "CHANGES",
      "revision-live",
      "EVENT",
      2,
      syncTwo,
    ]);
  });
});
