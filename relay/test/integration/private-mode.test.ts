import { afterEach, describe, expect, test } from "bun:test";

import { REVISION_SYNC_EVENT_KIND } from "../../src/types";
import {
  connectWs,
  sendJson,
  startTestRevisionRelay,
  waitForMessage,
  type RevisionRelayTestContext,
} from "../helpers";
import {
  AUTH_PUBKEY,
  REV_A,
  authEvent,
  cleanupContexts,
  revisionEventForRecipient,
  traceOptions,
} from "./fixtures";

const contexts: RevisionRelayTestContext[] = [];

describe("relay integration > private mode", () => {
  afterEach(async () => {
    await cleanupContexts(contexts);
  });

  test("sends an AUTH challenge and rejects revision writes before authentication", async () => {
    const ctx = await startTestRevisionRelay(35220, { privateMode: true });
    contexts.push(ctx);

    const ws = await connectWs(ctx.port, traceOptions(ctx, "private-open"));
    const challenge = await waitForMessage(
      ws,
      3_000,
      traceOptions(ctx, "private-open"),
    );
    expect(challenge[0]).toBe("AUTH");
    expect(typeof challenge[1]).toBe("string");

    const event = revisionEventForRecipient(
      REV_A,
      AUTH_PUBKEY,
      1_700_000_000_000,
    );
    sendJson(ws, ["EVENT", event], traceOptions(ctx, "private-open"));

    expect(
      await waitForMessage(ws, 3_000, traceOptions(ctx, "private-open")),
    ).toEqual([
      "OK",
      event.id,
      false,
      "auth-required: authentication required for revision writes",
    ]);
  });

  test("rejects AUTH for pubkeys that are not on the allowlist", async () => {
    const ctx = await startTestRevisionRelay(35221, {
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

  test("authenticates an allowlisted pubkey and authorizes scoped revision traffic", async () => {
    const ctx = await startTestRevisionRelay(35222, {
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

    const event = revisionEventForRecipient(
      REV_A,
      AUTH_PUBKEY,
      1_700_000_000_000,
    );
    sendJson(ws, ["EVENT", event], traceOptions(ctx, "private-auth-ok"));
    expect(
      await waitForMessage(ws, 3_000, traceOptions(ctx, "private-auth-ok")),
    ).toEqual(["OK", event.id, true, `stored: revision ${REV_A}`]);

    sendJson(
      ws,
      [
        "REQ",
        "private-fetch",
        {
          kinds: [REVISION_SYNC_EVENT_KIND],
          "#p": [AUTH_PUBKEY],
          "#r": [REV_A],
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

  test("rejects revision queries scoped to a different recipient namespace", async () => {
    const ctx = await startTestRevisionRelay(35223, {
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
        "wrong-recipient",
        {
          kinds: [REVISION_SYNC_EVENT_KIND],
          "#p": [
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          ],
          "#r": [REV_A],
        },
      ],
      traceOptions(ctx, "private-scope"),
    );

    expect(
      await waitForMessage(ws, 3_000, traceOptions(ctx, "private-scope")),
    ).toEqual([
      "CLOSED",
      "wrong-recipient",
      "restricted: can only query revision state addressed to you",
    ]);
  });
});
