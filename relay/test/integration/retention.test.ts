import { afterEach, describe, expect, test } from "bun:test";
import { count } from "drizzle-orm";

import { REVISION_SYNC_EVENT_KIND } from "../../src/types";
import { createRevisionRelayDb } from "../../src/db";
import { createHeadStore } from "../../src/storage/heads";
import { relayEvents } from "../../src/storage/schema";
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
  REV_C,
  cleanupContexts,
  deletionRevisionEvent,
  genericEvent,
  revisionEvent,
  traceOptions,
} from "./fixtures";

describe("relay integration > retention", () => {
  const contexts: RevisionRelayTestContext[] = [];

  afterEach(async () => {
    await cleanupContexts(contexts);
  });

  test("advertises payload retention boundaries after payload compaction", async () => {
    const ctx = await startTestRevisionRelay(39417);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const oldEvent = revisionEvent(REV_A, 1_700_000_000_000);
    const newEvent = revisionEvent(REV_B, 1_800_000_000_000, [REV_A]);

    sendJson(ws, ["EVENT", oldEvent], trace);
    await waitForMessage(ws, 3_000, trace);
    sendJson(ws, ["EVENT", newEvent], trace);
    await waitForMessage(ws, 3_000, trace);

    expect(await ctx.compactPayloadsBefore(1_750_000_000_000)).toBe(1);

    const response = await fetch(`http://127.0.0.1:${ctx.port}/`, {
      headers: { Accept: "application/nostr+json" },
    });

    expect(await response.json()).toEqual({
      name: "Relay",
      description:
        "Relay implementation for revision-scoped sync with current-head Negentropy and relay-local changes feed.",
      software: "relay",
      version: "0.1.0",
      supported_nips: [11, "CF", "NEG-REV"],
      changes_feed: {
        min_seq: 1,
      },
      revision_sync: {
        strategy: "revision-sync.v1",
        current_head_negentropy: true,
        changes_feed: true,
        recipient_scoped: true,
        retention: {
          min_payload_mtime: 1_800_000_000_000,
        },
      },
    });
  });

  test("returns EVENT-STATUS when a known revision payload was compacted", async () => {
    const ctx = await startTestRevisionRelay(39419);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const oldEvent = revisionEvent(REV_A, 1_700_000_000_000);
    const newEvent = revisionEvent(REV_B, 1_800_000_000_000, [REV_A]);

    sendJson(ws, ["EVENT", oldEvent], trace);
    await waitForMessage(ws, 3_000, trace);
    sendJson(ws, ["EVENT", newEvent], trace);
    await waitForMessage(ws, 3_000, trace);

    expect(await ctx.compactPayloadsBefore(1_750_000_000_000)).toBe(1);

    sendJson(
      ws,
      [
        "REQ",
        "fetch-compacted",
        {
          kinds: [REVISION_SYNC_EVENT_KIND],
          "#p": ["recipient-1"],
          "#r": [REV_A],
        },
      ],
      trace,
    );

    expect(await waitForMessages(ws, 2, 3_000, trace)).toEqual([
      [
        "EVENT-STATUS",
        "fetch-compacted",
        { rev: REV_A, status: "payload_compacted" },
      ],
      ["EOSE", "fetch-compacted"],
    ]);
  });

  test("returns retained and compacted revisions together in a mixed REQ fetch", async () => {
    const ctx = await startTestRevisionRelay(39434);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const oldEvent = revisionEvent(REV_A, 1_700_000_000_000);
    const newEvent = revisionEvent(REV_B, 1_800_000_000_000, [REV_A]);

    sendJson(ws, ["EVENT", oldEvent], trace);
    await waitForMessage(ws, 3_000, trace);
    sendJson(ws, ["EVENT", newEvent], trace);
    await waitForMessage(ws, 3_000, trace);

    expect(await ctx.compactPayloadsBefore(1_750_000_000_000)).toBe(1);

    sendJson(
      ws,
      [
        "REQ",
        "fetch-mixed",
        {
          kinds: [REVISION_SYNC_EVENT_KIND],
          "#p": ["recipient-1"],
          "#r": [REV_A, REV_B],
        },
      ],
      trace,
    );

    expect(await waitForMessages(ws, 3, 3_000, trace)).toEqual([
      ["EVENT", "fetch-mixed", newEvent],
      [
        "EVENT-STATUS",
        "fetch-mixed",
        { rev: REV_A, status: "payload_compacted" },
      ],
      ["EOSE", "fetch-mixed"],
    ]);
  });

  test("retains the current head payload after compacting older ancestors", async () => {
    const ctx = await startTestRevisionRelay(39451);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const oldEvent = revisionEvent(REV_A, 1_700_000_000_000);
    const headEvent = revisionEvent(REV_B, 1_800_000_000_000, [REV_A]);

    sendJson(ws, ["EVENT", oldEvent], trace);
    await waitForMessage(ws, 3_000, trace);
    sendJson(ws, ["EVENT", headEvent], trace);
    await waitForMessage(ws, 3_000, trace);

    expect(await ctx.compactPayloadsBefore(1_900_000_000_000)).toBe(1);

    sendJson(
      ws,
      [
        "REQ",
        "fetch-head",
        {
          kinds: [REVISION_SYNC_EVENT_KIND],
          "#p": ["recipient-1"],
          "#r": [REV_B],
        },
      ],
      trace,
    );

    expect(await waitForMessages(ws, 2, 3_000, trace)).toEqual([
      ["EVENT", "fetch-head", headEvent],
      ["EOSE", "fetch-head"],
    ]);
  });

  test("retains unresolved conflict head payloads during compaction", async () => {
    const ctx = await startTestRevisionRelay(39454);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const baseEvent = revisionEvent(REV_A, 1_700_000_000_000);
    const leftHead = revisionEvent(REV_B, 1_800_000_000_000, [REV_A]);
    const rightHead = revisionEvent(REV_C, 1_800_000_000_100, [REV_A]);

    for (const event of [baseEvent, leftHead, rightHead]) {
      sendJson(ws, ["EVENT", event], trace);
      await waitForMessage(ws, 3_000, trace);
    }

    expect(await ctx.compactPayloadsBefore(1_900_000_000_000)).toBe(1);

    sendJson(
      ws,
      [
        "REQ",
        "fetch-conflict-heads",
        {
          kinds: [REVISION_SYNC_EVENT_KIND],
          "#p": ["recipient-1"],
          "#r": [REV_B, REV_C],
        },
      ],
      trace,
    );

    expect(await waitForMessages(ws, 3, 3_000, trace)).toEqual([
      ["EVENT", "fetch-conflict-heads", leftHead],
      ["EVENT", "fetch-conflict-heads", rightHead],
      ["EOSE", "fetch-conflict-heads"],
    ]);
  });

  test("retains the latest tombstone head payload during compaction", async () => {
    const ctx = await startTestRevisionRelay(39455);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const baseEvent = revisionEvent(REV_A, 1_700_000_000_000);
    const tombstoneEvent = deletionRevisionEvent(REV_B, 1_800_000_000_000, [
      REV_A,
    ]);

    sendJson(ws, ["EVENT", baseEvent], trace);
    await waitForMessage(ws, 3_000, trace);
    sendJson(ws, ["EVENT", tombstoneEvent], trace);
    await waitForMessage(ws, 3_000, trace);

    expect(await ctx.compactPayloadsBefore(1_900_000_000_000)).toBe(1);

    sendJson(
      ws,
      [
        "REQ",
        "fetch-tombstone",
        {
          kinds: [REVISION_SYNC_EVENT_KIND],
          "#p": ["recipient-1"],
          "#r": [REV_B],
        },
      ],
      trace,
    );

    expect(await waitForMessages(ws, 2, 3_000, trace)).toEqual([
      ["EVENT", "fetch-tombstone", tombstoneEvent],
      ["EOSE", "fetch-tombstone"],
    ]);
  });

  test("preserves snapshot head derivation after compacting a longer revision chain", async () => {
    const ctx = await startTestRevisionRelay(39467);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const firstEvent = revisionEvent(REV_A, 1_700_000_000_000);
    const secondEvent = revisionEvent(REV_B, 1_700_000_000_100, [REV_A]);
    const thirdEvent = revisionEvent(REV_C, 1_700_000_000_200, [REV_B]);

    for (const event of [firstEvent, secondEvent, thirdEvent]) {
      sendJson(ws, ["EVENT", event], trace);
      await waitForMessage(ws, 3_000, trace);
    }

    expect(await ctx.compactPayloadsBefore(1_800_000_000_000)).toBe(2);

    const { db, sql } = createRevisionRelayDb(ctx.databaseUrl);
    try {
      const headStore = createHeadStore(db);
      expect(
        await headStore.listHeadsAtSnapshot({ recipient: "recipient-1" }, 2),
      ).toEqual([
        {
          recipient: "recipient-1",
          documentId: "doc-1",
          revisionId: REV_B,
          op: "put",
          mtime: 1_700_000_000_100,
        },
      ]);
      expect(
        await headStore.listHeadsAtSnapshot({ recipient: "recipient-1" }, 3),
      ).toEqual([
        {
          recipient: "recipient-1",
          documentId: "doc-1",
          revisionId: REV_C,
          op: "put",
          mtime: 1_700_000_000_200,
        },
      ]);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  test("compacts payloads independently across multiple documents in one recipient namespace", async () => {
    const ctx = await startTestRevisionRelay(39468);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const oldDocBase = revisionEvent(REV_A, 1_700_000_000_000, [], "doc-old");
    const oldDocHead = revisionEvent(
      REV_B,
      1_800_000_000_000,
      [REV_A],
      "doc-old",
    );
    const otherDocHead = revisionEvent(
      REV_C,
      1_850_000_000_000,
      [],
      "doc-other",
    );

    for (const event of [oldDocBase, oldDocHead, otherDocHead]) {
      sendJson(ws, ["EVENT", event], trace);
      await waitForMessage(ws, 3_000, trace);
    }

    expect(await ctx.compactPayloadsBefore(1_825_000_000_000)).toBe(1);

    sendJson(
      ws,
      [
        "REQ",
        "multi-doc-retention",
        {
          kinds: [REVISION_SYNC_EVENT_KIND],
          "#p": ["recipient-1"],
          "#r": [REV_A, REV_B, REV_C],
        },
      ],
      trace,
    );

    expect(await waitForMessages(ws, 4, 3_000, trace)).toEqual([
      ["EVENT", "multi-doc-retention", oldDocHead],
      ["EVENT", "multi-doc-retention", otherDocHead],
      [
        "EVENT-STATUS",
        "multi-doc-retention",
        { rev: REV_A, status: "payload_compacted" },
      ],
      ["EOSE", "multi-doc-retention"],
    ]);
  });

  test("does not compact configured generic event storage", async () => {
    const ctx = await startTestRevisionRelay(39469, {
      companionKinds: [10002],
    });
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const generic = genericEvent("generic-retained", 10002, [
      ["p", "recipient-1"],
    ]);
    const oldEvent = revisionEvent(REV_A, 1_700_000_000_000);
    const headEvent = revisionEvent(REV_B, 1_800_000_000_000, [REV_A]);

    sendJson(ws, ["EVENT", generic], trace);
    await waitForMessage(ws, 3_000, trace);
    sendJson(ws, ["EVENT", oldEvent], trace);
    await waitForMessage(ws, 3_000, trace);
    sendJson(ws, ["EVENT", headEvent], trace);
    await waitForMessage(ws, 3_000, trace);

    expect(await ctx.compactPayloadsBefore(1_900_000_000_000)).toBe(1);

    const { db, sql } = createRevisionRelayDb(ctx.databaseUrl);
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
