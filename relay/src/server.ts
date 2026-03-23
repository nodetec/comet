import { sql as rawSql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { migrationsFolder } from "@comet/data";
import { initAccessControl } from "./access";
import { ConnectionManager, type RelaySocketData } from "./connections";
import { createDB, type DB } from "./db";
import {
  handleDisconnect,
  handleMessage,
  type RelayDeps,
} from "./relay/handler";
import { getRelayInfoDocument } from "./relay/nip/11";
import { initStorage } from "./relay/storage";

export type RelayServerOptions = {
  port?: number;
  relayUrl?: string;
  databaseUrl?: string;
  privateMode?: boolean;
  resetDatabase?: boolean;
};

export type RelayRuntime = {
  db: DB;
  sql: ReturnType<typeof createDB>["sql"];
  storage: ReturnType<typeof initStorage>;
  access: Awaited<ReturnType<typeof initAccessControl>>;
  connections: ConnectionManager;
  server: Bun.Server<RelaySocketData>;
  relayUrl: string;
  port: number;
  stop: () => Promise<void>;
};

function parsePort(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getDefaultRelayUrl(port: number): string {
  if (process.env.RELAY_URL) {
    return process.env.RELAY_URL;
  }

  if (process.env.FLY_APP_NAME) {
    return `wss://${process.env.FLY_APP_NAME}.fly.dev`;
  }

  return `ws://localhost:${port}`;
}

function isWebSocketUpgrade(req: Request): boolean {
  return req.headers.get("upgrade")?.toLowerCase() === "websocket";
}

function isRelaySocketPath(pathname: string): boolean {
  return pathname === "/" || pathname === "/ws";
}

async function waitForShutdown(
  promise: Promise<void>,
  timeoutMs: number,
): Promise<void> {
  const timedOut = await Promise.race([
    promise.then(() => false),
    Bun.sleep(timeoutMs).then(() => true),
  ]);

  if (timedOut) {
    console.warn(
      `[SHUTDOWN] relay server stop timed out after ${timeoutMs}ms; continuing cleanup`,
    );
  }
}

async function truncateAll(db: DB): Promise<void> {
  await db.execute(
    rawSql`TRUNCATE events, event_tags, deleted_events, deleted_coords, changes, change_tags, users, invite_codes, blobs, blob_owners CASCADE`,
  );
  await db.execute(rawSql`ALTER SEQUENCE changes_seq_seq RESTART WITH 1`);
}

export async function createRelayServer(
  options: RelayServerOptions = {},
): Promise<RelayRuntime> {
  const port = options.port ?? parsePort(process.env.PORT, 3000);
  const relayUrl = options.relayUrl ?? getDefaultRelayUrl(port);
  const privateMode =
    options.privateMode ?? process.env.PRIVATE_MODE === "true";
  const { db, sql } = createDB(options.databaseUrl);

  await migrate(db, { migrationsFolder });
  if (options.resetDatabase) {
    await truncateAll(db);
  }

  const storage = initStorage(db);
  const access = initAccessControl(db, privateMode);
  const connections = new ConnectionManager();
  const relayDeps: RelayDeps = { storage, connections, relayUrl, access };

  const server = Bun.serve<RelaySocketData>({
    port,
    async fetch(req, serverInstance) {
      const url = new URL(req.url);

      if (isRelaySocketPath(url.pathname) && isWebSocketUpgrade(req)) {
        const upgraded = serverInstance.upgrade(req, {
          data: {
            connId: crypto.randomUUID(),
            challenge: crypto.randomUUID(),
          },
        });
        if (upgraded) {
          return;
        }
      }

      if (url.pathname === "/") {
        const accept = req.headers.get("accept") ?? "";
        if (accept.includes("application/nostr+json")) {
          const minSeq = await storage.getMinSeq();
          return Response.json(getRelayInfoDocument(minSeq), {
            status: 200,
            headers: {
              "Content-Type": "application/nostr+json",
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET",
              "Access-Control-Allow-Headers": "Accept",
            },
          });
        }
        return new Response("Comet relay", { status: 200 });
      }

      if (url.pathname === "/ws") {
        return new Response("Upgrade Required", { status: 426 });
      }

      if (url.pathname === "/healthz") {
        return new Response("ok", { status: 200 });
      }

      if (url.pathname === "/admin/connections" && req.method === "GET") {
        const adminToken = process.env.ADMIN_TOKEN;
        if (!adminToken) {
          return Response.json(
            { error: "admin not configured" },
            { status: 503 },
          );
        }
        const auth = req.headers.get("authorization");
        if (auth !== `Bearer ${adminToken}`) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }
        const result = [];
        for (const [id, state] of connections.entries()) {
          result.push({
            id,
            authedPubkeys: Array.from(state.authedPubkeys),
          });
        }
        return Response.json({ connections: result });
      }

      return new Response("Not Found", { status: 404 });
    },
    websocket: {
      open(ws) {
        const { connId, challenge } = ws.data;
        connections.add(connId, challenge, ws);
        connections.sendJSON(connId, ["AUTH", challenge]);
      },
      async message(ws, message) {
        await handleMessage(ws.data.connId, message, relayDeps);
      },
      close(ws) {
        handleDisconnect(ws.data.connId, relayDeps);
      },
    },
  });

  return {
    db,
    sql,
    storage,
    access,
    connections,
    server,
    relayUrl,
    port,
    stop: async () => {
      connections.closeAll(1001, "server shutdown", true);
      await waitForShutdown(server.stop(true), 1000);
      await sql.end({ timeout: 1 });
    },
  };
}
