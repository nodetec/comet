import { describe, expect, test } from "bun:test";

import { createNegentropySession } from "../../src/domain/revisions/negentropy-adapter";

const REV_A =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const REV_B =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("createNegentropySession", () => {
  test("reconciles identical sets to no differences", async () => {
    const left = createNegentropySession([
      { id: REV_A, timestamp: 1000 },
      { id: REV_B, timestamp: 2000 },
    ]);
    const right = createNegentropySession([
      { id: REV_A, timestamp: 1000 },
      { id: REV_B, timestamp: 2000 },
    ]);

    let message: string | null = await left.initiate();
    while (message !== null) {
      const server = await right.reconcile(message);
      const client = await left.reconcile(server.nextMessage ?? "");
      message = client.nextMessage;
      expect(client.have).toEqual([]);
      expect(client.need).toEqual([]);
    }
  });

  test("discovers missing revisions on the client", async () => {
    const client = createNegentropySession([{ id: REV_A, timestamp: 1000 }]);
    const server = createNegentropySession([
      { id: REV_A, timestamp: 1000 },
      { id: REV_B, timestamp: 2000 },
    ]);

    let message: string | null = await client.initiate();
    let finalNeed: string[] = [];
    while (message !== null) {
      const serverResult = await server.reconcile(message);
      const clientResult = await client.reconcile(
        serverResult.nextMessage ?? "",
      );
      finalNeed = clientResult.need;
      message = clientResult.nextMessage;
    }

    expect(finalNeed).toContain(REV_B);
  });

  test("converges for identical sets with millisecond timestamps", async () => {
    const base = 1_773_656_717_000;
    const step = 2_634_000;
    const items = Array.from({ length: 50 }, (_, index) => ({
      id: (index + 1).toString(16).padStart(64, "0"),
      timestamp: base + index * step,
    }));

    const left = createNegentropySession(items);
    const right = createNegentropySession(items);

    let message: string | null = await left.initiate();
    let rounds = 0;
    while (message !== null && rounds < 10) {
      rounds += 1;
      const server = await right.reconcile(message);
      const client = await left.reconcile(server.nextMessage ?? "");
      message = client.nextMessage;
      expect(client.have).toEqual([]);
      expect(client.need).toEqual([]);
    }

    expect(rounds).toBeLessThan(10);
    expect(message).toBeNull();
  });
});
