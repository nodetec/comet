import { afterEach, describe, expect, test } from "bun:test";

import {
  startTestSnapshotRelay,
  type SnapshotRelayTestContext,
} from "../helpers";
import { cleanupContexts } from "./fixtures";

describe("relay integration > info", () => {
  const contexts: SnapshotRelayTestContext[] = [];

  afterEach(async () => {
    await cleanupContexts(contexts);
  });

  test("advertises snapshot-sync capabilities at the relay root", async () => {
    const ctx = await startTestSnapshotRelay(39414);
    contexts.push(ctx);

    const response = await fetch(`http://127.0.0.1:${ctx.port}/`, {
      headers: { Accept: "application/nostr+json" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      name: "Relay",
      description:
        "Relay implementation for author-scoped snapshot sync with bootstrap replay and relay-local changes feed.",
      software: "relay",
      version: "0.1.0",
      supported_nips: [11, "CF"],
      changes_feed: {
        min_seq: 0,
      },
      snapshot_sync: {
        changes_feed: true,
        author_scoped: true,
        retention: {
          min_payload_mtime: null,
        },
      },
    });
  });

  test("accepts websocket upgrades on the relay root", async () => {
    const ctx = await startTestSnapshotRelay(39415);
    contexts.push(ctx);

    const ws = new WebSocket(`ws://127.0.0.1:${ctx.port}/`);

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = (event) => reject(event);
    });

    ws.close();
  });
});
