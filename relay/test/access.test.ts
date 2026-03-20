import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
} from "nostr-tools/pure";
import type { NostrEvent } from "../src/types";
import {
  startTestRelay,
  connectRaw,
  waitForMessage,
  type TestContext,
} from "./helpers";

const sk = generateSecretKey();
const pubkey = getPublicKey(sk);

const otherSk = generateSecretKey();
const otherPubkey = getPublicKey(otherSk);

function sign(
  key: Uint8Array,
  overrides: Partial<{
    kind: number;
    content: string;
    tags: string[][];
    created_at: number;
  }> = {},
): NostrEvent {
  return finalizeEvent(
    {
      kind: overrides.kind ?? 1,
      content: overrides.content ?? "",
      tags: overrides.tags ?? [],
      created_at: overrides.created_at ?? Math.floor(Date.now() / 1000),
    },
    key,
  ) as unknown as NostrEvent;
}

// --- Unit tests ---

describe("AccessControl (open mode)", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await startTestRelay(39231, { privateMode: false });
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  test("open mode allows everyone", () => {
    expect(ctx.access.isAllowed(pubkey)).toBe(true);
    expect(ctx.access.isAllowed(otherPubkey)).toBe(true);
    expect(ctx.access.privateMode).toBe(false);
  });
});

describe("AccessControl (private mode)", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await startTestRelay(39232, { privateMode: true });
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  test("private mode rejects unknown pubkeys", () => {
    expect(ctx.access.isAllowed(pubkey)).toBe(false);
    expect(ctx.access.privateMode).toBe(true);
  });

  test("allow adds a pubkey", async () => {
    await ctx.access.allow(pubkey, null);
    expect(ctx.access.isAllowed(pubkey)).toBe(true);
    expect(ctx.access.isAllowed(otherPubkey)).toBe(false);
  });

  test("revoke removes a pubkey", async () => {
    await ctx.access.allow(otherPubkey, null);
    expect(ctx.access.isAllowed(otherPubkey)).toBe(true);
    const revoked = await ctx.access.revoke(otherPubkey);
    expect(revoked).toBe(true);
    expect(ctx.access.isAllowed(otherPubkey)).toBe(false);
  });

  test("list returns all pubkeys", async () => {
    await ctx.access.allow(otherPubkey, 1700000000);
    const list = await ctx.access.list();
    expect(list).toHaveLength(2);
    expect(list.find((e) => e.pubkey === pubkey)?.expires_at).toBeNull();
    expect(list.find((e) => e.pubkey === otherPubkey)?.expires_at).toBe(
      1700000000,
    );
  });
});

// --- Private mode integration tests ---

describe("private mode relay integration", () => {
  let ctx: TestContext;
  const RELAY_PORT = 39129;

  async function authenticate(
    ws: WebSocket,
    challenge: string,
    key: Uint8Array,
  ): Promise<unknown[]> {
    const authEvent = finalizeEvent(
      {
        kind: 22242,
        content: "",
        tags: [
          ["relay", `ws://localhost:${RELAY_PORT}`],
          ["challenge", challenge],
        ],
        created_at: Math.floor(Date.now() / 1000),
      },
      key,
    );
    ws.send(JSON.stringify(["AUTH", authEvent]));
    return new Promise((resolve) => {
      ws.onmessage = (e) => resolve(JSON.parse(e.data as string));
    });
  }

  beforeAll(async () => {
    ctx = await startTestRelay(RELAY_PORT, { privateMode: true });
    await ctx.access.allow(pubkey, null);
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  test("unauthenticated EVENT is rejected in private mode", async () => {
    const { ws } = await connectRaw(ctx.port);

    const note = sign(sk, { kind: 1, content: "hello" });
    ws.send(JSON.stringify(["EVENT", note]));
    const ok = await waitForMessage(ws);
    expect(ok[0]).toBe("OK");
    expect(ok[2]).toBe(false);
    expect(ok[3] as string).toContain("auth-required");

    ws.close();
  });

  test("unauthenticated REQ is rejected in private mode", async () => {
    const { ws } = await connectRaw(ctx.port);

    ws.send(JSON.stringify(["REQ", "sub", { kinds: [1] }]));
    const msg = await waitForMessage(ws);
    expect(msg[0]).toBe("CLOSED");
    expect(msg[2] as string).toContain("auth-required");

    ws.close();
  });

  test("non-allowed pubkey AUTH is rejected", async () => {
    const { ws, challenge } = await connectRaw(ctx.port);

    const ok = await authenticate(ws, challenge, otherSk);
    expect(ok[2]).toBe(false);
    expect(ok[3] as string).toContain("not authorized");

    ws.close();
  });

  test("allowed pubkey can authenticate and write", async () => {
    const { ws, challenge } = await connectRaw(ctx.port);

    const ok = await authenticate(ws, challenge, sk);
    expect(ok[2]).toBe(true);

    const note = sign(sk, { kind: 1, content: "private note" });
    ws.send(JSON.stringify(["EVENT", note]));
    const eventOk = await waitForMessage(ws);
    expect(eventOk[2]).toBe(true);

    ws.close();
  });

  test("allowed pubkey can subscribe", async () => {
    const { ws, challenge } = await connectRaw(ctx.port);
    await authenticate(ws, challenge, sk);

    ws.send(JSON.stringify(["REQ", "sub", { kinds: [1] }]));
    const msg = await waitForMessage(ws);
    expect(["EVENT", "EOSE"]).toContain(msg[0] as string);

    ws.close();
  });
});
