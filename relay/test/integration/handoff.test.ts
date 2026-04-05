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

describe("relay integration > handoff", () => {
  const contexts: SnapshotRelayTestContext[] = [];

  afterEach(async () => {
    await cleanupContexts(contexts);
  });

  test("returns retained snapshots through CHANGES bootstrap", async () => {
    const ctx = await startTestSnapshotRelay(39415);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);
    const event = snapshotEvent(REV_B);

    sendJson(ws, ["EVENT", event], trace);
    await waitForMessage(ws, 3_000, trace);

    sendJson(
      ws,
      [
        "CHANGES",
        "bootstrap-fetch",
        {
          mode: "bootstrap",
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: ["author-1"],
        },
      ],
      trace,
    );
    const bootstrap = await waitForBootstrapSnapshots(
      ws,
      "bootstrap-fetch",
      trace,
    );
    expect(bootstrap.snapshotSeq).toEqual(1);
    expect(bootstrap.snapshots).toEqual([event]);

    sendJson(
      ws,
      [
        "REQ",
        "fetch-1",
        {
          ids: [event.id],
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: ["author-1"],
        },
      ],
      trace,
    );

    expect(await waitForMessages(ws, 2, 3_000, trace)).toEqual([
      ["EVENT", "fetch-1", event],
      ["EOSE", "fetch-1"],
    ]);
  });

  test("returns only EOSE when REQ asks for an unknown snapshot id", async () => {
    const ctx = await startTestSnapshotRelay(39432);
    contexts.push(ctx);

    const trace = traceOptions(ctx, "client");
    const ws = await connectWs(ctx.port, trace);

    sendJson(
      ws,
      [
        "REQ",
        "fetch-missing",
        {
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: ["author-1"],
          ids: [`event-${REV_A}`],
        },
      ],
      trace,
    );

    expect(await waitForMessages(ws, 1, 3_000, trace)).toEqual([
      ["EOSE", "fetch-missing"],
    ]);
  });

  test("hands off from bootstrap snapshot to CHANGES without missing later snapshots", async () => {
    const ctx = await startTestSnapshotRelay(39435);
    contexts.push(ctx);

    const bootstrapTrace = traceOptions(ctx, "bootstrap");
    const publisherTrace = traceOptions(ctx, "publisher");
    const bootstrapWs = await connectWs(ctx.port, bootstrapTrace);
    const publisherWs = await connectWs(ctx.port, publisherTrace);
    const initialEvent = snapshotEvent(REV_A, 1_700_000_000_000);
    const laterEvent = snapshotEvent(REV_B, 1_700_000_000_100, [REV_A]);

    sendJson(publisherWs, ["EVENT", initialEvent], publisherTrace);
    await waitForMessage(publisherWs, 3_000, publisherTrace);

    sendJson(
      bootstrapWs,
      [
        "CHANGES",
        "handoff",
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
      "handoff",
      bootstrapTrace,
    );
    expect(bootstrap.snapshotSeq).toEqual(1);
    expect(bootstrap.snapshots).toEqual([initialEvent]);

    sendJson(publisherWs, ["EVENT", laterEvent], publisherTrace);
    await waitForMessage(publisherWs, 3_000, publisherTrace);

    sendJson(
      bootstrapWs,
      [
        "CHANGES",
        "handoff-live",
        {
          mode: "tail",
          since: 1,
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: ["author-1"],
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
