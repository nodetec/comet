import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { generateSecretKey, finalizeEvent } from "nostr-tools/pure";
import type { NostrEvent } from "../src/types";
import {
  startTestRelay,
  connectWs,
  waitForMessage,
  waitForMessages,
  type TestContext,
} from "./helpers";

let ctx: TestContext;

function createSignedEvent(
  sk: Uint8Array,
  overrides: Partial<{ kind: number; content: string; tags: string[][] }> = {},
) {
  return finalizeEvent(
    {
      kind: overrides.kind ?? 1,
      content: overrides.content ?? "test note",
      tags: overrides.tags ?? [],
      created_at: Math.floor(Date.now() / 1000),
    },
    sk,
  ) as unknown as NostrEvent;
}

beforeAll(async () => {
  ctx = await startTestRelay(39123);
});

afterAll(async () => {
  await ctx.cleanup();
});

describe("relay integration", () => {
  test("NIP-11 relay info via HTTP", async () => {
    const res = await fetch(`http://localhost:${ctx.port}`, {
      headers: { Accept: "application/nostr+json" },
    });
    expect(res.status).toBe(200);
    const info = await res.json();
    expect(info.name).toBe("Comet Relay");
    expect(info.software).toBe("comet-relay");
    expect(info.supported_nips).toContain(1);
  });

  test("EVENT → OK → REQ returns event + EOSE", async () => {
    const sk = generateSecretKey();
    const event = createSignedEvent(sk);

    const ws = await connectWs(ctx.port);

    ws.send(JSON.stringify(["EVENT", event]));
    const okMsg = (await waitForMessage(ws)) as unknown[];
    expect(okMsg[0]).toBe("OK");
    expect(okMsg[1]).toBe(event.id);
    expect(okMsg[2]).toBe(true);

    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    const msgs = await waitForMessages(ws, 2);

    const eventMsg = msgs.find((m: any) => m[0] === "EVENT") as unknown[];
    const eoseMsg = msgs.find((m: any) => m[0] === "EOSE") as unknown[];
    expect(eventMsg).toBeDefined();
    expect(eventMsg![2]).toHaveProperty("id", event.id);
    expect(eoseMsg).toBeDefined();
    expect(eoseMsg![1]).toBe("sub1");

    ws.close();
  });

  test("live subscription receives new events", async () => {
    const sk = generateSecretKey();
    const ws = await connectWs(ctx.port);

    ws.send(JSON.stringify(["REQ", "live", { kinds: [9999] }]));
    const eoseMsg = (await waitForMessage(ws)) as unknown[];
    expect(eoseMsg[0]).toBe("EOSE");

    const livePromise = waitForMessage(ws);

    const ws2 = await connectWs(ctx.port);
    const event = createSignedEvent(sk, { kind: 9999, content: "live event" });
    ws2.send(JSON.stringify(["EVENT", event]));
    await waitForMessage(ws2);

    const liveMsg = (await livePromise) as unknown[];
    expect(liveMsg[0]).toBe("EVENT");
    expect(liveMsg[1]).toBe("live");
    expect((liveMsg[2] as any).content).toBe("live event");

    ws.close();
    ws2.close();
  });

  test("CLOSE removes subscription", async () => {
    const ws = await connectWs(ctx.port);
    ws.send(JSON.stringify(["REQ", "temp", { kinds: [1] }]));
    await waitForMessages(ws, 1, 1000);

    ws.send(JSON.stringify(["CLOSE", "temp"]));

    const sk = generateSecretKey();
    const event = createSignedEvent(sk, { content: "after close" });

    const ws2 = await connectWs(ctx.port);
    ws2.send(JSON.stringify(["EVENT", event]));
    await waitForMessage(ws2);

    const msgs = await waitForMessages(ws, 1, 500);
    const tempMsgs = (msgs as any[]).filter(
      (m) => m[0] === "EVENT" && m[1] === "temp",
    );
    expect(tempMsgs.length).toBe(0);

    ws.close();
    ws2.close();
  });

  test("invalid event returns OK false", async () => {
    const ws = await connectWs(ctx.port);

    ws.send(
      JSON.stringify([
        "EVENT",
        {
          id: "bad",
          pubkey: "bad",
          created_at: 0,
          kind: 1,
          tags: [],
          content: "",
          sig: "bad",
        },
      ]),
    );
    const msg = (await waitForMessage(ws)) as unknown[];
    expect(msg[0]).toBe("OK");
    expect(msg[2]).toBe(false);

    ws.close();
  });

  test("invalid JSON returns NOTICE", async () => {
    const ws = await connectWs(ctx.port);
    ws.send("not json{{{");
    const msg = (await waitForMessage(ws)) as unknown[];
    expect(msg[0]).toBe("NOTICE");

    ws.close();
  });
});
