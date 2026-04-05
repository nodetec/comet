import { afterEach, describe, expect, test } from "bun:test";

import { SNAPSHOT_SYNC_EVENT_KIND } from "../../src/types";
import {
  connectWs,
  sendJson,
  startTestSnapshotRelay,
  waitForMessage,
  type SnapshotRelayTestContext,
} from "../helpers";
import {
  AUTH_PUBKEY,
  REV_A,
  authEvent,
  cleanupContexts,
  snapshotEventForAuthor,
  traceOptions,
} from "./fixtures";

const contexts: SnapshotRelayTestContext[] = [];

describe("relay integration > private mode", () => {
  afterEach(async () => {
    await cleanupContexts(contexts);
  });

  test("sends an AUTH challenge and rejects snapshot writes before authentication", async () => {
    const ctx = await startTestSnapshotRelay(35220, { privateMode: true });
    contexts.push(ctx);

    const ws = await connectWs(ctx.port, traceOptions(ctx, "private-open"));
    const challenge = await waitForMessage(
      ws,
      3_000,
      traceOptions(ctx, "private-open"),
    );
    expect(challenge[0]).toBe("AUTH");
    expect(typeof challenge[1]).toBe("string");

    const event = snapshotEventForAuthor(REV_A, AUTH_PUBKEY, 1_700_000_000_000);
    sendJson(ws, ["EVENT", event], traceOptions(ctx, "private-open"));

    expect(
      await waitForMessage(ws, 3_000, traceOptions(ctx, "private-open")),
    ).toEqual([
      "OK",
      event.id,
      false,
      "auth-required: authentication required for snapshot writes",
    ]);
  });

  test("rejects AUTH for pubkeys that are not on the allowlist", async () => {
    const ctx = await startTestSnapshotRelay(35221, {
      privateMode: true,
      adminToken: "secret-token",
    });
    contexts.push(ctx);

    const ws = await connectWs(
      ctx.port,
      traceOptions(ctx, "private-auth-reject"),
    );
    const challengeMessage = await waitForMessage(
      ws,
      3_000,
      traceOptions(ctx, "private-auth-reject"),
    );
    const challenge = challengeMessage[1] as string;

    const auth = authEvent(challenge, ctx.relayUrl);
    sendJson(ws, ["AUTH", auth], traceOptions(ctx, "private-auth-reject"));

    expect(
      await waitForMessage(ws, 3_000, traceOptions(ctx, "private-auth-reject")),
    ).toEqual([
      "OK",
      auth.id,
      false,
      "restricted: pubkey not authorized on this relay",
    ]);
  });

  test("authenticates an allowlisted pubkey and authorizes scoped snapshot traffic", async () => {
    const ctx = await startTestSnapshotRelay(35222, {
      privateMode: true,
      adminToken: "secret-token",
    });
    contexts.push(ctx);

    await fetch(`${ctx.httpUrl}/admin/allowlist`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret-token",
      },
      body: JSON.stringify({ pubkey: AUTH_PUBKEY }),
    });

    const ws = await connectWs(ctx.port, traceOptions(ctx, "private-auth-ok"));
    const challengeMessage = await waitForMessage(
      ws,
      3_000,
      traceOptions(ctx, "private-auth-ok"),
    );
    const challenge = challengeMessage[1] as string;
    const auth = authEvent(challenge, ctx.relayUrl);

    sendJson(ws, ["AUTH", auth], traceOptions(ctx, "private-auth-ok"));
    expect(
      await waitForMessage(ws, 3_000, traceOptions(ctx, "private-auth-ok")),
    ).toEqual(["OK", auth.id, true, ""]);

    const event = snapshotEventForAuthor(REV_A, AUTH_PUBKEY, 1_700_000_000_000);
    sendJson(ws, ["EVENT", event], traceOptions(ctx, "private-auth-ok"));
    expect(
      await waitForMessage(ws, 3_000, traceOptions(ctx, "private-auth-ok")),
    ).toEqual(["OK", event.id, true, `stored: snapshot ${event.id}`]);

    sendJson(
      ws,
      [
        "REQ",
        "private-fetch",
        {
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: [AUTH_PUBKEY],
          ids: [event.id],
        },
      ],
      traceOptions(ctx, "private-auth-ok"),
    );
    expect(
      await waitForMessage(ws, 3_000, traceOptions(ctx, "private-auth-ok")),
    ).toEqual(["EVENT", "private-fetch", event]);
    expect(
      await waitForMessage(ws, 3_000, traceOptions(ctx, "private-auth-ok")),
    ).toEqual(["EOSE", "private-fetch"]);
  });

  test("rejects snapshot queries scoped to a different author namespace", async () => {
    const ctx = await startTestSnapshotRelay(35223, {
      privateMode: true,
      adminToken: "secret-token",
    });
    contexts.push(ctx);

    await fetch(`${ctx.httpUrl}/admin/allowlist`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret-token",
      },
      body: JSON.stringify({ pubkey: AUTH_PUBKEY }),
    });

    const ws = await connectWs(ctx.port, traceOptions(ctx, "private-scope"));
    const challengeMessage = await waitForMessage(
      ws,
      3_000,
      traceOptions(ctx, "private-scope"),
    );
    const auth = authEvent(challengeMessage[1] as string, ctx.relayUrl);

    sendJson(ws, ["AUTH", auth], traceOptions(ctx, "private-scope"));
    expect(
      await waitForMessage(ws, 3_000, traceOptions(ctx, "private-scope")),
    ).toEqual(["OK", auth.id, true, ""]);

    sendJson(
      ws,
      [
        "REQ",
        "wrong-author",
        {
          kinds: [SNAPSHOT_SYNC_EVENT_KIND],
          authors: [
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          ],
          ids: [`event-${REV_A}`],
        },
      ],
      traceOptions(ctx, "private-scope"),
    );

    expect(
      await waitForMessage(ws, 3_000, traceOptions(ctx, "private-scope")),
    ).toEqual([
      "CLOSED",
      "wrong-author",
      "restricted: can only query your own snapshot state",
    ]);
  });
});
