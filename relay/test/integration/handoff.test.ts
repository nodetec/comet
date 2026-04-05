import { afterEach, describe, expect, test } from "bun:test";

import { REVISION_SYNC_EVENT_KIND } from "../../src/types";
import { createRevisionRelayDb } from "../../src/db";
import { createHeadStore } from "../../src/storage/heads";
import {
  connectWs,
  sendJson,
  startTestRevisionRelay,
  waitForNegentropyConvergence,
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

describe("relay integration > handoff", () => {
  const contexts: RevisionRelayTestContext[] = [];

  afterEach(async () => {
    await cleanupContexts(contexts);
  });

  test("derives snapshot heads from immutable revisions at snapshot_seq", async () => {
    const ctx = await startTestRevisionRelay(39430);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const initialEvent = revisionEvent(REV_A, 1_700_000_000_000);
    const nextEvent = revisionEvent(REV_B, 1_700_000_000_100, [REV_A]);

    sendJson(ws, ["EVENT", initialEvent], trace);
    await waitForMessage(ws, 3_000, trace);

    sendJson(ws, ["EVENT", nextEvent], trace);
    await waitForMessage(ws, 3_000, trace);

    const { db, sql } = createRevisionRelayDb(ctx.databaseUrl);
    try {
      const headStore = createHeadStore(db);

      expect(
        await headStore.listHeads({ authorPubkey: "recipient-1" }),
      ).toEqual([
        {
          authorPubkey: "recipient-1",
          documentCoord: "doc-1",
          revisionId: REV_B,
          op: "put",
          mtime: 1_700_000_000_000,
        },
      ]);

      expect(
        await headStore.listHeadsAtSnapshot({ authorPubkey: "recipient-1" }, 1),
      ).toEqual([
        {
          authorPubkey: "recipient-1",
          documentCoord: "doc-1",
          revisionId: REV_A,
          op: "put",
          mtime: 1_700_000_000_000,
        },
      ]);

      expect(
        await headStore.listHeadsAtSnapshot({ authorPubkey: "recipient-1" }, 2),
      ).toEqual([
        {
          authorPubkey: "recipient-1",
          documentCoord: "doc-1",
          revisionId: REV_B,
          op: "put",
          mtime: 1_700_000_000_000,
        },
      ]);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  test("uses Negentropy need results to fetch missing revisions by #r", async () => {
    const ctx = await startTestRevisionRelay(39415);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const event = revisionEvent(REV_B);

    sendJson(ws, ["EVENT", event], trace);
    await waitForMessage(ws, 3_000, trace);

    sendJson(
      ws,
      [
        "NEG-OPEN",
        "neg-fetch",
        { kinds: [REVISION_SYNC_EVENT_KIND], authors: ["recipient-1"] },
      ],
      trace,
    );
    await waitForMessage(ws, 3_000, trace);

    const result = await waitForNegentropyConvergence(
      ws,
      "neg-fetch",
      [],
      trace,
    );
    expect(result.need).toEqual([REV_B]);
    expect(result.have).toEqual([]);

    sendJson(
      ws,
      [
        "REQ",
        "fetch-1",
        {
          kinds: [REVISION_SYNC_EVENT_KIND],
          authors: ["recipient-1"],
          "#r": [REV_B],
        },
      ],
      trace,
    );

    expect(await waitForMessages(ws, 2, 3_000, trace)).toEqual([
      ["EVENT", "fetch-1", event],
      ["EOSE", "fetch-1"],
    ]);
  });

  test("returns only EOSE when REQ asks for an unknown revision id", async () => {
    const ctx = await startTestRevisionRelay(39432);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);

    sendJson(
      ws,
      [
        "REQ",
        "fetch-missing",
        {
          kinds: [REVISION_SYNC_EVENT_KIND],
          authors: ["recipient-1"],
          "#r": [REV_A],
        },
      ],
      trace,
    );

    expect(await waitForMessages(ws, 1, 3_000, trace)).toEqual([
      ["EOSE", "fetch-missing"],
    ]);
  });

  test("hands off from Negentropy snapshot to CHANGES without missing later revisions", async () => {
    const ctx = await startTestRevisionRelay(39435);
    contexts.push(ctx);

    const bootstrapTrace = traceOptions(ctx, "bootstrap");
    const publisherTrace = traceOptions(ctx, "publisher");
    const bootstrapWs = await connectWs(ctx.port, bootstrapTrace);
    const publisherWs = await connectWs(ctx.port, publisherTrace);
    const initialEvent = revisionEvent(REV_A, 1_700_000_000_000);
    const laterEvent = revisionEvent(REV_B, 1_700_000_000_100, [REV_A]);

    sendJson(publisherWs, ["EVENT", initialEvent], publisherTrace);
    await waitForMessage(publisherWs, 3_000, publisherTrace);

    sendJson(
      bootstrapWs,
      [
        "NEG-OPEN",
        "handoff",
        { kinds: [REVISION_SYNC_EVENT_KIND], authors: ["recipient-1"] },
      ],
      bootstrapTrace,
    );
    expect(await waitForMessage(bootstrapWs, 3_000, bootstrapTrace)).toEqual([
      "NEG-STATUS",
      "handoff",
      { strategy: "revision-sync.v1", snapshot_seq: 1 },
    ]);

    sendJson(publisherWs, ["EVENT", laterEvent], publisherTrace);
    await waitForMessage(publisherWs, 3_000, publisherTrace);

    const negentropy = await waitForNegentropyConvergence(
      bootstrapWs,
      "handoff",
      [],
      bootstrapTrace,
    );
    expect(negentropy.need).toEqual([REV_A]);
    expect(negentropy.have).toEqual([]);

    sendJson(
      bootstrapWs,
      [
        "CHANGES",
        "handoff-live",
        {
          since: 1,
          kinds: [REVISION_SYNC_EVENT_KIND],
          authors: ["recipient-1"],
        },
      ],
      bootstrapTrace,
    );

    expect(
      await waitForMessages(bootstrapWs, 2, 3_000, bootstrapTrace),
    ).toEqual([
      ["CHANGES", "handoff-live", "EVENT", 2, laterEvent],
      ["CHANGES", "handoff-live", "EOSE", 2],
    ]);
  });
});
