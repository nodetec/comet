import { afterEach, describe, expect, test } from "bun:test";

import {
  startTestRevisionRelay,
  type RevisionRelayTestContext,
} from "../helpers";
import { cleanupContexts } from "./fixtures";

describe("relay integration > info", () => {
  const contexts: RevisionRelayTestContext[] = [];

  afterEach(async () => {
    await cleanupContexts(contexts);
  });

  test("advertises revision-sync capabilities at the relay root", async () => {
    const ctx = await startTestRevisionRelay(39414);
    contexts.push(ctx);

    const response = await fetch(`http://127.0.0.1:${ctx.port}/`, {
      headers: { Accept: "application/nostr+json" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      name: "Relay",
      description:
        "Relay implementation for revision-scoped sync with current-head Negentropy and relay-local changes feed.",
      software: "relay",
      version: "0.1.0",
      supported_nips: [11, "CF", "NEG-REV"],
      changes_feed: {
        min_seq: 0,
      },
      revision_sync: {
        strategy: "revision-sync.v1",
        current_head_negentropy: true,
        changes_feed: true,
        recipient_scoped: true,
        retention: {
          min_payload_mtime: null,
        },
      },
    });
  });

  test("accepts websocket upgrades on the relay root", async () => {
    const ctx = await startTestRevisionRelay(39415);
    contexts.push(ctx);

    const ws = new WebSocket(`ws://127.0.0.1:${ctx.port}/`);

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = (event) => reject(event);
    });

    ws.close();
  });
});
