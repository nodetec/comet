import type { DB } from "../src/db";
import type { ConnectionManager } from "../src/connections";
import type { initStorage } from "../src/relay/storage";
import type { initAccessControl } from "../src/access";
import { createRelayServer } from "../src/server";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL || "postgres://localhost/comet_test";

export type TestContext = {
  db: DB;
  sql: Awaited<ReturnType<typeof createRelayServer>>["sql"];
  storage: ReturnType<typeof initStorage>;
  access: Awaited<ReturnType<typeof initAccessControl>>;
  connections: ConnectionManager;
  server: ReturnType<typeof Bun.serve>;
  port: number;
  relayUrl: string;
  cleanup: () => Promise<void>;
};

/**
 * Start a test relay server on the given port.
 * Each test suite should use a unique port.
 */
export async function startTestRelay(
  port: number,
  opts?: { privateMode?: boolean },
): Promise<TestContext> {
  const relayUrl = `ws://localhost:${port}`;
  const runtime = await createRelayServer({
    port,
    relayUrl,
    privateMode: opts?.privateMode ?? false,
    databaseUrl: TEST_DB_URL,
    resetDatabase: true,
  });

  return {
    db: runtime.db,
    sql: runtime.sql,
    storage: runtime.storage,
    access: runtime.access,
    connections: runtime.connections,
    server: runtime.server as ReturnType<typeof Bun.serve>,
    port: runtime.port,
    relayUrl: runtime.relayUrl,
    cleanup: runtime.stop,
  };
}

// --- WebSocket helpers ---

export async function connectWs(port: number): Promise<WebSocket> {
  const ws = new WebSocket(`ws://localhost:${port}`);
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = (e) => reject(e);
  });
  await new Promise<void>((resolve) => {
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data as string);
      if (msg[0] === "AUTH") resolve();
    };
  });
  return ws;
}

export async function connectRaw(
  port: number,
): Promise<{ ws: WebSocket; challenge: string }> {
  const ws = new WebSocket(`ws://localhost:${port}`);
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = (e) => reject(e);
  });
  const challenge = await new Promise<string>((resolve) => {
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data as string);
      if (msg[0] === "AUTH") resolve(msg[1]);
    };
  });
  return { ws, challenge };
}

export function waitForMessage(
  ws: WebSocket,
  timeoutMs = 3000,
): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    ws.onmessage = (e) => {
      clearTimeout(timer);
      resolve(JSON.parse(e.data as string));
    };
  });
}

export function waitForMessages(
  ws: WebSocket,
  count: number,
  timeoutMs = 3000,
): Promise<unknown[][]> {
  return new Promise((resolve) => {
    const messages: unknown[][] = [];
    const timer = setTimeout(() => resolve(messages), timeoutMs);
    ws.onmessage = (e) => {
      messages.push(JSON.parse(e.data as string));
      if (messages.length >= count) {
        clearTimeout(timer);
        resolve(messages);
      }
    };
  });
}
