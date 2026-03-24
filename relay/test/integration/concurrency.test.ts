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
  REV_C,
  cleanupContexts,
  revisionEvent,
  traceOptions,
} from "./fixtures";

describe("relay integration > concurrency", () => {
  const contexts: RevisionRelayTestContext[] = [];

  afterEach(async () => {
    await cleanupContexts(contexts);
  });

  test("keeps sibling revisions as conflict heads when two clients publish against the same parent", async () => {
    const ctx = await startTestRevisionRelay(39448);
    contexts.push(ctx);

    const parentTrace = traceOptions(ctx, "parent");
    const leftTrace = traceOptions(ctx, "left");
    const rightTrace = traceOptions(ctx, "right");
    const parentWs = await connectWs(ctx.port, parentTrace);
    const leftWs = await connectWs(ctx.port, leftTrace);
    const rightWs = await connectWs(ctx.port, rightTrace);

    const parentEvent = revisionEvent(REV_A, 1_700_000_000_000);
    const leftEvent = revisionEvent(REV_B, 1_700_000_000_100, [REV_A]);
    const rightEvent = revisionEvent(REV_C, 1_700_000_000_200, [REV_A]);

    sendJson(parentWs, ["EVENT", parentEvent], parentTrace);
    await waitForMessage(parentWs, 3_000, parentTrace);

    sendJson(leftWs, ["EVENT", leftEvent], leftTrace);
    sendJson(rightWs, ["EVENT", rightEvent], rightTrace);
    await waitForMessage(leftWs, 3_000, leftTrace);
    await waitForMessage(rightWs, 3_000, rightTrace);

    const { db, sql } = createRevisionRelayDb(ctx.databaseUrl);
    try {
      const headStore = createHeadStore(db);
      expect(await headStore.listHeads({ recipient: "recipient-1" })).toEqual([
        {
          recipient: "recipient-1",
          documentId: "doc-1",
          revisionId: REV_B,
          op: "put",
          mtime: 1_700_000_000_100,
        },
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

  test("keeps live subscribers and bootstrap clients consistent while a third client publishes", async () => {
    const ctx = await startTestRevisionRelay(39449);
    contexts.push(ctx);

    const publisherTrace = traceOptions(ctx, "publisher");
    const liveTrace = traceOptions(ctx, "live");
    const bootstrapTrace = traceOptions(ctx, "bootstrap");
    const publisherWs = await connectWs(ctx.port, publisherTrace);
    const liveWs = await connectWs(ctx.port, liveTrace);
    const bootstrapWs = await connectWs(ctx.port, bootstrapTrace);

    const initialEvent = revisionEvent(REV_A, 1_700_000_000_000);
    const laterEvent = revisionEvent(REV_B, 1_700_000_000_100, [REV_A]);

    sendJson(publisherWs, ["EVENT", initialEvent], publisherTrace);
    await waitForMessage(publisherWs, 3_000, publisherTrace);

    sendJson(
      liveWs,
      [
        "CHANGES",
        "live-mixed",
        {
          since: 1,
          kinds: [REVISION_SYNC_EVENT_KIND],
          "#p": ["recipient-1"],
          live: true,
        },
      ],
      liveTrace,
    );
    expect(await waitForMessage(liveWs, 3_000, liveTrace)).toEqual([
      "CHANGES",
      "live-mixed",
      "EOSE",
      1,
    ]);

    sendJson(
      bootstrapWs,
      [
        "NEG-OPEN",
        "mixed-bootstrap",
        { kinds: [REVISION_SYNC_EVENT_KIND], "#p": ["recipient-1"] },
      ],
      bootstrapTrace,
    );
    expect(await waitForMessage(bootstrapWs, 3_000, bootstrapTrace)).toEqual([
      "NEG-STATUS",
      "mixed-bootstrap",
      { strategy: "revision-sync.v1", snapshot_seq: 1 },
    ]);

    const liveEventPromise = waitForMessage(liveWs, 3_000, liveTrace);
    sendJson(publisherWs, ["EVENT", laterEvent], publisherTrace);
    await waitForMessage(publisherWs, 3_000, publisherTrace);

    expect(
      await waitForNegentropyConvergence(
        bootstrapWs,
        "mixed-bootstrap",
        [],
        bootstrapTrace,
      ),
    ).toEqual({ have: [], need: [REV_A] });

    expect(await liveEventPromise).toEqual([
      "CHANGES",
      "live-mixed",
      "EVENT",
      2,
      laterEvent,
    ]);

    sendJson(
      bootstrapWs,
      [
        "CHANGES",
        "mixed-tail",
        {
          since: 1,
          kinds: [REVISION_SYNC_EVENT_KIND],
          "#p": ["recipient-1"],
        },
      ],
      bootstrapTrace,
    );
    expect(
      await waitForMessages(bootstrapWs, 2, 3_000, bootstrapTrace),
    ).toEqual([
      ["CHANGES", "mixed-tail", "EVENT", 2, laterEvent],
      ["CHANGES", "mixed-tail", "EOSE", 2],
    ]);
  });
});
