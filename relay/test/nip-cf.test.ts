import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
} from "nostr-tools/pure";
import type { NostrEvent } from "../src/types";
import { isValidChangesFilter } from "../src/relay/nip/cf";
import {
  startTestRelay,
  connectWs,
  waitForMessage,
  waitForMessages,
  type TestContext,
} from "./helpers";

const sk = generateSecretKey();
const pubkey = getPublicKey(sk);

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

// --- Pure logic tests ---

describe("isValidChangesFilter", () => {
  test("accepts valid filter", () => {
    expect(isValidChangesFilter({ since: 0, live: true })).toBe(true);
    expect(
      isValidChangesFilter({ since: 0, kinds: [1], authors: ["a".repeat(64)] }),
    ).toBe(true);
    expect(isValidChangesFilter({ since: 0, until_seq: 100, limit: 10 })).toBe(
      true,
    );
    expect(isValidChangesFilter({ "#t": ["test"] })).toBe(true);
    expect(isValidChangesFilter({})).toBe(true);
  });

  test("rejects invalid filter", () => {
    expect(isValidChangesFilter({ since: "bad" })).toBe(false);
    expect(isValidChangesFilter({ live: "yes" })).toBe(false);
    expect(isValidChangesFilter({ kinds: "1" })).toBe(false);
    expect(isValidChangesFilter(null)).toBe(false);
    expect(isValidChangesFilter(undefined)).toBe(false);
  });
});

// --- Storage unit tests ---

describe("storage changelog", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await startTestRelay(39230);
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  test("regular event creates STORED changelog entry", async () => {
    const event = sign(sk, { content: "hello" });
    const result = await ctx.storage.saveEvent(event);
    expect(result.saved).toBe(true);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].type).toBe("STORED");
    expect(result.changes[0].eventId).toBe(event.id);
    expect(result.changes[0].kind).toBe(1);
    expect(result.changes[0].pubkey).toBe(pubkey);
    expect(result.changes[0].seq).toBeGreaterThan(0);
  });

  test("duplicate event produces no changelog entries", async () => {
    const event = sign(sk, { content: "dupe test" });
    await ctx.storage.saveEvent(event);
    const result = await ctx.storage.saveEvent(event);
    expect(result.saved).toBe(false);
    expect(result.changes).toHaveLength(0);
  });

  test("replaceable event creates DELETED + STORED entries", async () => {
    const now = Math.floor(Date.now() / 1000);
    const old = sign(sk, {
      kind: 0,
      content: '{"name":"old"}',
      created_at: now,
    });
    await ctx.storage.saveEvent(old);

    const newer = sign(sk, {
      kind: 0,
      content: '{"name":"new"}',
      created_at: now + 1,
    });
    const result = await ctx.storage.saveEvent(newer);
    expect(result.saved).toBe(true);
    expect(result.changes).toHaveLength(2);

    const deleted = result.changes.find((c) => c.type === "DELETED")!;
    const stored = result.changes.find((c) => c.type === "STORED")!;
    expect(deleted.eventId).toBe(old.id);
    expect(deleted.reason).toEqual({ superseded_by: newer.id });
    expect(stored.eventId).toBe(newer.id);
    expect(stored.seq).toBeGreaterThan(deleted.seq);
  });

  test("addressable event creates DELETED + STORED entries", async () => {
    const now = Math.floor(Date.now() / 1000);
    const old = sign(sk, {
      kind: 30023,
      content: "# V1",
      tags: [["d", "addr-test"]],
      created_at: now,
    });
    await ctx.storage.saveEvent(old);

    const newer = sign(sk, {
      kind: 30023,
      content: "# V2",
      tags: [["d", "addr-test"]],
      created_at: now + 1,
    });
    const result = await ctx.storage.saveEvent(newer);
    expect(result.saved).toBe(true);

    const deleted = result.changes.find((c) => c.type === "DELETED")!;
    const stored = result.changes.find((c) => c.type === "STORED")!;
    expect(deleted.eventId).toBe(old.id);
    expect(deleted.reason).toEqual({ superseded_by: newer.id });
    expect(stored.eventId).toBe(newer.id);
  });

  test("NIP-09 deletion creates DELETED changelog entries", async () => {
    const note = sign(sk, { content: "to delete for changelog" });
    await ctx.storage.saveEvent(note);

    const del = sign(sk, {
      kind: 5,
      tags: [
        ["e", note.id],
        ["k", "1"],
      ],
    });
    await ctx.storage.saveEvent(del);
    const result = await ctx.storage.processDeletionRequest(del);

    expect(result.deleted).toBe(1);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].type).toBe("DELETED");
    expect(result.changes[0].eventId).toBe(note.id);
    expect(result.changes[0].reason).toEqual({ deletion_id: del.id });
  });

  test("queryChanges returns entries in seq order", async () => {
    const all = await ctx.storage.queryChanges({ since: 0 });
    expect(all.length).toBeGreaterThan(0);
    for (let i = 1; i < all.length; i++) {
      expect(all[i].seq).toBeGreaterThan(all[i - 1].seq);
    }
  });

  test("queryChanges respects since filter", async () => {
    const all = await ctx.storage.queryChanges({ since: 0 });
    const midSeq = all[Math.floor(all.length / 2)].seq;
    const after = await ctx.storage.queryChanges({ since: midSeq });
    expect(after.every((c) => c.seq > midSeq)).toBe(true);
  });

  test("queryChanges respects until_seq filter", async () => {
    const all = await ctx.storage.queryChanges({ since: 0 });
    const midSeq = all[Math.floor(all.length / 2)].seq;
    const before = await ctx.storage.queryChanges({
      since: 0,
      until_seq: midSeq,
    });
    expect(before.every((c) => c.seq <= midSeq)).toBe(true);
  });

  test("queryChanges respects limit", async () => {
    const limited = await ctx.storage.queryChanges({ since: 0, limit: 2 });
    expect(limited).toHaveLength(2);
  });
});

// --- Integration tests ---

describe("relay integration - NIP-CF", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await startTestRelay(39126);
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  test("NIP-11 advertises CF support and changes_feed", async () => {
    const res = await fetch(`http://localhost:${ctx.port}`, {
      headers: { Accept: "application/nostr+json" },
    });
    const info = (await res.json()) as any;
    expect(info.supported_nips).toContain("CF");
    expect(info.changes_feed).toBeDefined();
    expect(typeof info.changes_feed.min_seq).toBe("number");
  });

  test("CHANGES returns STORED entries + EOSE", async () => {
    const ws = await connectWs(ctx.port);

    const e1 = sign(sk, { kind: 1, content: "cf-test-1" });
    const e2 = sign(sk, { kind: 1, content: "cf-test-2" });
    ws.send(JSON.stringify(["EVENT", e1]));
    await waitForMessage(ws);
    ws.send(JSON.stringify(["EVENT", e2]));
    await waitForMessage(ws);

    ws.send(JSON.stringify(["CHANGES", "sync1", { since: 0, kinds: [1] }]));
    const msgs = await waitForMessages(ws, 3, 2000);

    const events = msgs.filter((m) => m[0] === "CHANGES" && m[2] === "EVENT");
    const eose = msgs.find((m) => m[0] === "CHANGES" && m[2] === "EOSE");
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(eose).toBeDefined();

    for (const evt of events) {
      expect(typeof evt[3]).toBe("number");
      expect(evt[4] as any).toHaveProperty("id");
    }

    const seqs = events.map((e) => e[3] as number);
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
    }

    expect(typeof eose![3]).toBe("number");
    expect(eose![3] as number).toBeGreaterThanOrEqual(seqs[seqs.length - 1]);

    ws.close();
  });

  test("CHANGES returns DELETED entries for NIP-09 deletions", async () => {
    const ws = await connectWs(ctx.port);

    const note = sign(sk, { kind: 1, content: "cf-delete-test" });
    ws.send(JSON.stringify(["EVENT", note]));
    await waitForMessage(ws);

    const del = sign(sk, {
      kind: 5,
      tags: [
        ["e", note.id],
        ["k", "1"],
      ],
    });
    ws.send(JSON.stringify(["EVENT", del]));
    await waitForMessage(ws);

    ws.send(JSON.stringify(["CHANGES", "delsync", { since: 0 }]));
    const msgs = await waitForMessages(ws, 5, 2000);

    const deleted = msgs.filter(
      (m) => m[0] === "CHANGES" && m[2] === "DELETED",
    );
    expect(deleted.length).toBeGreaterThanOrEqual(1);

    const delEntry = deleted.find((m) => m[4] === note.id);
    expect(delEntry).toBeDefined();
    expect((delEntry![5] as any).deletion_id).toBe(del.id);

    ws.close();
  });

  test("incremental sync with since checkpoint", async () => {
    const ws = await connectWs(ctx.port);

    const e1 = sign(sk, { kind: 7777, content: "inc-1" });
    ws.send(JSON.stringify(["EVENT", e1]));
    await waitForMessage(ws);

    ws.send(JSON.stringify(["CHANGES", "inc1", { since: 0, kinds: [7777] }]));
    const batch1 = await waitForMessages(ws, 2, 2000);
    const eose1 = batch1.find((m) => m[0] === "CHANGES" && m[2] === "EOSE")!;
    const checkpoint = eose1[3] as number;

    const e2 = sign(sk, { kind: 7777, content: "inc-2" });
    ws.send(JSON.stringify(["EVENT", e2]));
    await waitForMessage(ws);

    ws.send(
      JSON.stringify(["CHANGES", "inc2", { since: checkpoint, kinds: [7777] }]),
    );
    const batch2 = await waitForMessages(ws, 2, 2000);
    const events2 = batch2.filter(
      (m) => m[0] === "CHANGES" && m[2] === "EVENT",
    );
    expect(events2).toHaveLength(1);
    expect((events2[0][4] as any).id).toBe(e2.id);

    ws.close();
  });

  test("live mode streams new changes after EOSE", async () => {
    const ws = await connectWs(ctx.port);

    ws.send(
      JSON.stringify([
        "CHANGES",
        "live1",
        { since: 0, kinds: [8888], live: true },
      ]),
    );
    const eose = await waitForMessage(ws);
    expect(eose[2]).toBe("EOSE");

    const livePromise = waitForMessage(ws);

    const ws2 = await connectWs(ctx.port);
    const event = sign(sk, { kind: 8888, content: "live-cf" });
    ws2.send(JSON.stringify(["EVENT", event]));
    await waitForMessage(ws2);

    const liveMsg = await livePromise;
    expect(liveMsg[0]).toBe("CHANGES");
    expect(liveMsg[1]).toBe("live1");
    expect(liveMsg[2]).toBe("EVENT");
    expect(typeof liveMsg[3]).toBe("number");
    expect((liveMsg[4] as any).id).toBe(event.id);

    ws.close();
    ws2.close();
  });

  test("invalid filter returns ERR", async () => {
    const ws = await connectWs(ctx.port);

    ws.send(JSON.stringify(["CHANGES", "bad", { since: "not-a-number" }]));
    const msg = await waitForMessage(ws);
    expect(msg[0]).toBe("CHANGES");
    expect(msg[2]).toBe("ERR");

    ws.close();
  });
});
