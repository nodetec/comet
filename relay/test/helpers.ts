import postgres from "postgres";

import { createRevisionRelayServer } from "../src/server";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/postgres";
const TEST_LOGS_ENABLED =
  process.env.RELAY_TEST_LOGS === "1" ||
  process.env.REVISION_RELAY_TEST_LOGS === "1";

export type RevisionRelayTestContext = {
  port: number;
  relayUrl: string;
  httpUrl: string;
  databaseUrl: string;
  transcript: string[];
  compactPayloadsBefore: (mtime: number) => Promise<number>;
  connectionCount: () => number;
  log: (message: string) => void;
  dumpTranscript: () => string;
  cleanup: () => Promise<void>;
};

export async function startTestRevisionRelay(
  port: number,
  options: {
    adminToken?: string | null;
    privateMode?: boolean;
    companionKinds?: number[];
    passThroughKinds?: number[];
  } = {},
): Promise<RevisionRelayTestContext> {
  const databaseName = `relay_test_${port}_${Date.now()}`;
  await createDatabase(databaseName);

  const databaseUrl = databaseUrlFor(databaseName);
  const relayUrl = `ws://localhost:${port}/ws`;
  const httpUrl = `http://127.0.0.1:${port}`;
  const transcript: string[] = [];
  const log = (message: string) => {
    const entry = `[relay:${port}] ${message}`;
    transcript.push(entry);
    if (TEST_LOGS_ENABLED) {
      console.error(entry);
    }
  };
  const runtime = await createRevisionRelayServer({
    port,
    host: "127.0.0.1",
    databaseUrl,
    relayUrl,
    privateMode: options.privateMode ?? false,
    adminToken: options.adminToken ?? null,
    defaultPayloadRetentionDays: null,
    defaultCompactionIntervalSeconds: 300,
    companionKinds: options.companionKinds ?? [],
    passThroughKinds: options.passThroughKinds ?? [],
    resetDatabase: true,
  });

  return {
    port,
    relayUrl,
    httpUrl,
    databaseUrl,
    transcript,
    compactPayloadsBefore: runtime.compaction.compactPayloadsBefore,
    connectionCount: () => runtime.connections.size(),
    log,
    dumpTranscript: () => transcript.join("\n"),
    cleanup: async () => {
      log(`cleanup database=${databaseName}`);
      await runtime.stop();
      await dropDatabase(databaseName);
    },
  };
}

type TraceOptions = {
  context?: RevisionRelayTestContext;
  label?: string;
};

export async function connectWs(
  port: number,
  options: TraceOptions = {},
): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const label = options.label ?? `ws:${port}`;
  options.context?.log(`${label} connect ws://127.0.0.1:${port}/ws`);
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => {
      options.context?.log(`${label} open`);
      resolve();
    };
    ws.onerror = (error) => {
      options.context?.log(
        `${label} error ${error instanceof Error ? error.message : "unknown error"}`,
      );
      reject(error);
    };
  });
  ws.onclose = (event) => {
    options.context?.log(
      `${label} close code=${event.code} reason=${event.reason || "<none>"}`,
    );
  };
  return ws;
}

export function waitForMessage(
  ws: WebSocket,
  timeoutMs = 3_000,
  options: TraceOptions = {},
): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const label = options.label ?? "ws";
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            [
              `timeout waiting for message on ${label}`,
              options.context?.dumpTranscript(),
            ]
              .filter(Boolean)
              .join("\n\n"),
          ),
        ),
      timeoutMs,
    );
    ws.onmessage = (event) => {
      clearTimeout(timer);
      const parsed = JSON.parse(event.data as string) as unknown[];
      options.context?.log(`${label} <- ${JSON.stringify(parsed)}`);
      resolve(parsed);
    };
  });
}

export function waitForMessages(
  ws: WebSocket,
  count: number,
  timeoutMs = 3_000,
  options: TraceOptions = {},
): Promise<unknown[][]> {
  return new Promise((resolve) => {
    const label = options.label ?? "ws";
    const messages: unknown[][] = [];
    const timer = setTimeout(() => resolve(messages), timeoutMs);
    ws.onmessage = (event) => {
      const parsed = JSON.parse(event.data as string) as unknown[];
      options.context?.log(`${label} <- ${JSON.stringify(parsed)}`);
      messages.push(parsed);
      if (messages.length >= count) {
        clearTimeout(timer);
        resolve(messages);
      }
    };
  });
}

export function sendJson(
  ws: WebSocket,
  message: unknown[],
  options: TraceOptions = {},
) {
  options.context?.log(
    `${options.label ?? "ws"} -> ${JSON.stringify(message)}`,
  );
  ws.send(JSON.stringify(message));
}

export function expectNoMessage(
  ws: WebSocket,
  timeoutMs = 300,
  options: TraceOptions = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const label = options.label ?? "ws";
    const timer = setTimeout(() => {
      options.context?.log(`${label} <- <no message for ${timeoutMs}ms>`);
      resolve();
    }, timeoutMs);

    ws.onmessage = (event) => {
      clearTimeout(timer);
      const parsed = JSON.parse(event.data as string) as unknown[];
      options.context?.log(`${label} <- ${JSON.stringify(parsed)}`);
      reject(
        new Error(
          [
            `expected no message on ${label} for ${timeoutMs}ms`,
            JSON.stringify(parsed),
            options.context?.dumpTranscript(),
          ]
            .filter(Boolean)
            .join("\n\n"),
        ),
      );
    };
  });
}

export async function waitForNegentropyConvergence(
  ws: WebSocket,
  subscriptionId: string,
  localItems: { id: string; timestamp: number }[],
  options: TraceOptions = {},
) {
  const { createNegentropySession } =
    await import("../src/domain/revisions/negentropy-adapter");
  const client = createNegentropySession(localItems);

  let message: string | null = await client.initiate();
  let finalHave: string[] = [];
  let finalNeed: string[] = [];

  while (message !== null) {
    const responsePromise = waitForMessage(ws, 3_000, options);
    sendJson(ws, ["NEG-MSG", subscriptionId, message], options);
    const response = await responsePromise;
    if (!Array.isArray(response) || response[0] !== "NEG-MSG") {
      throw new Error(`unexpected NEG response: ${JSON.stringify(response)}`);
    }

    const result = await client.reconcile(response[2] as string);
    finalHave = result.have;
    finalNeed = result.need;
    message = result.nextMessage;
  }

  return { have: finalHave, need: finalNeed };
}

export async function waitFor(
  predicate: () => boolean,
  options: {
    timeoutMs?: number;
    intervalMs?: number;
    context?: RevisionRelayTestContext;
    label?: string;
  } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 3_000;
  const intervalMs = options.intervalMs ?? 25;
  const started = Date.now();

  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(
        [
          `timeout waiting for condition${options.label ? `: ${options.label}` : ""}`,
          options.context?.dumpTranscript(),
        ]
          .filter(Boolean)
          .join("\n\n"),
      );
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

async function createDatabase(databaseName: string) {
  assertSafeDatabaseName(databaseName);
  const admin = postgres(databaseUrlFor("postgres"), {
    max: 1,
    onnotice: () => {},
  });
  try {
    await admin.unsafe(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await admin.end({ timeout: 5 });
  }
}

async function dropDatabase(databaseName: string) {
  assertSafeDatabaseName(databaseName);
  const admin = postgres(databaseUrlFor("postgres"), {
    max: 1,
    onnotice: () => {},
  });
  try {
    await admin`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = ${databaseName} AND pid <> pg_backend_pid()
    `;
    await admin.unsafe(`DROP DATABASE IF EXISTS "${databaseName}"`);
  } finally {
    await admin.end({ timeout: 5 });
  }
}

function databaseUrlFor(databaseName: string): string {
  const url = new URL(TEST_DB_URL);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function assertSafeDatabaseName(databaseName: string) {
  if (!/^[a-z0-9_]+$/u.test(databaseName)) {
    throw new Error(`unsafe database name: ${databaseName}`);
  }
}
