import { afterEach, describe, expect, test } from "bun:test";

import { SNAPSHOT_SYNC_EVENT_KIND } from "../../src/types";
import {
  connectWs,
  sendJson,
  startTestSnapshotRelay,
  waitForBootstrapSnapshots,
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

describe("relay integration > concurrency", () => {
  const contexts: SnapshotRelayTestContext[] = [];

  afterEach(async () => {
    await cleanupContexts(contexts);
  });

  test("keeps live subscribers and bootstrap clients consistent while a third client publishes", async () => {
    const ctx = await startTestSnapshotRelay(39_449);
    contexts.push(ctx);

    const publisherTrace = traceOptions(ctx, "publisher");
    const liveTrace = traceOptions(ctx, "live");
    const bootstrapTrace = traceOptions(ctx, "bootstrap");
    const publisherWs = await connectWs(ctx.port, publisherTrace);
    const liveWs = await connectWs(ctx.port, liveTrace);
    const bootstrapWs = await connectWs(ctx.port, bootstrapTrace);

    const initialEvent = snapshotEvent(REV_A, 1_700_000_000_000);
    const laterEvent = snapshotEvent(REV_B, 1_700_000_000_100, [REV_A]);

    sendJson(publisherWs, ["EVENT", initialEvent], publisherTrace);
    await waitForMessage(publisherWs, 3000, publisherTrace);

    sendJson(
      liveWs,
      [
        "CHANGES",
        "live-mixed",
        {
          mode: "tail",
          since: 1,
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: ["author-1"],
          live: true,
        },
      ],
      liveTrace,
    );
    expect(await waitForMessage(liveWs, 3000, liveTrace)).toEqual([
      "CHANGES",
      "live-mixed",
      "EOSE",
      1,
    ]);

    sendJson(
      bootstrapWs,
      [
        "CHANGES",
        "mixed-bootstrap",
        {
          mode: "bootstrap",
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: ["author-1"],
        },
      ],
      bootstrapTrace,
    );
    const bootstrap = await waitForBootstrapSnapshots(
      bootstrapWs,
      "mixed-bootstrap",
      bootstrapTrace,
    );
    expect(bootstrap.snapshotSeq).toEqual(1);
    expect(bootstrap.snapshots).toEqual([initialEvent]);

    const liveEventPromise = waitForMessage(liveWs, 3000, liveTrace);
    sendJson(publisherWs, ["EVENT", laterEvent], publisherTrace);
    await waitForMessage(publisherWs, 3000, publisherTrace);

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
          mode: "tail",
          since: 1,
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: ["author-1"],
        },
      ],
      bootstrapTrace,
    );
    expect(await waitForMessages(bootstrapWs, 2, 3000, bootstrapTrace)).toEqual(
      [
        ["CHANGES", "mixed-tail", "EVENT", 2, laterEvent],
        ["CHANGES", "mixed-tail", "EOSE", 2],
      ],
    );
  });
});
