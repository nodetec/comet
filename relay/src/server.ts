import { sql as rawSql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";

import { createAccessControl } from "./access";
import { createClientMessageHandler } from "./protocol/relay";
import { createRetentionPolicyRuntime } from "./application/relay/retention-policy";
import { createRevisionRelayDb, type RevisionRelayDb } from "./db";
import { createConnectionRegistry } from "./infra/connections";
import type { ConnectionRegistry } from "./infra/connections";
import type { RevisionRelayConfig } from "./types";
import { createChangeStore } from "./storage/changes";
import { createCompactionStore } from "./storage/compaction";
import { createGenericEventStore } from "./storage/events";
import { createHeadStore } from "./storage/heads";
import { migrationsFolder } from "./migrations";
import { getRevisionRelayInfoDocument } from "./protocol/info";
import { createRevisionStore } from "./storage/revisions";
import { createRelaySettingsStore } from "./storage/settings";

export type RevisionRelayRuntime = Awaited<
  ReturnType<typeof createRevisionRelayServer>
>;

type WebSocketData = {
  connectionId: string;
};

export async function createRevisionRelayServer(
  config: RevisionRelayConfig & { resetDatabase?: boolean },
) {
  const { db, sql } = createRevisionRelayDb(config.databaseUrl);
  await migrate(db, { migrationsFolder });
  if (config.resetDatabase) {
    await truncateAll(db);
  }
  const connections = createConnectionRegistry();
  const access = createAccessControl(db, config.privateMode);
  const genericEvents = createGenericEventStore(db);
  const changes = createChangeStore(db);
  const revisions = createRevisionStore(db);
  const heads = createHeadStore(db);
  const compaction = createCompactionStore(db);
  const settings = createRelaySettingsStore(db, {
    payloadRetentionDays: config.defaultPayloadRetentionDays,
    compactionIntervalSeconds: config.defaultCompactionIntervalSeconds,
  });
  const retention = createRetentionPolicyRuntime({
    settings,
    compaction,
    log: (message) => console.log(`[relay] ${message}`),
  });
  await retention.refresh();
  const routeMessage = createClientMessageHandler({
    kindPolicy: {
      companionKinds: config.companionKinds,
      passThroughKinds: config.passThroughKinds,
    },
    changeStore: changes,
    genericEventStore: genericEvents,
    revisionStore: revisions,
    headStore: heads,
    connections,
    access,
  });

  const server = Bun.serve<WebSocketData>({
    port: config.port,
    hostname: config.host,
    fetch(request, serverInstance) {
      const url = new URL(request.url);
      if (
        (url.pathname === "/" || url.pathname === "/ws") &&
        serverInstance.upgrade(request, {
          data: { connectionId: crypto.randomUUID() },
        })
      ) {
        return;
      }
      if (url.pathname === "/admin/retention") {
        return handleRetentionApiRequest(request, {
          adminToken: config.adminToken,
          settings,
          retention,
        });
      }
      if (url.pathname === "/admin/allowlist") {
        return handleAllowlistApiRequest(request, {
          adminToken: config.adminToken,
          access,
        });
      }
      if (url.pathname.startsWith("/admin/allowlist/")) {
        const pubkey = decodeURIComponent(
          url.pathname.slice("/admin/allowlist/".length),
        );
        return handleAllowlistUserApiRequest(request, {
          adminToken: config.adminToken,
          access,
          pubkey,
        });
      }
      if (url.pathname === "/admin/connections") {
        return handleConnectionsApiRequest(request, {
          adminToken: config.adminToken,
          connections,
        });
      }
      if (url.pathname === "/") {
        const accept = request.headers.get("accept") ?? "";
        if (accept.includes("application/nostr+json")) {
          return (async () => {
            const [minSeq, minPayloadMtime] = await Promise.all([
              changes.minSequence(),
              compaction.minPayloadMtime(),
            ]);
            return Response.json(
              getRevisionRelayInfoDocument({
                minSeq,
                minPayloadMtime,
              }),
              {
                status: 200,
                headers: {
                  "Content-Type": "application/nostr+json",
                  "Access-Control-Allow-Origin": "*",
                  "Access-Control-Allow-Methods": "GET",
                  "Access-Control-Allow-Headers": "Accept",
                },
              },
            );
          })();
        }
      }
      if (url.pathname === "/healthz") {
        return new Response("ok");
      }
      return new Response("Revision relay", { status: 200 });
    },
    websocket: {
      open(ws) {
        const challenge = crypto.randomUUID();
        connections.register(ws.data.connectionId, ws, challenge);
        if (config.privateMode) {
          ws.send(JSON.stringify(["AUTH", challenge]));
        }
      },
      message(ws, message) {
        if (typeof message !== "string") {
          ws.send(
            JSON.stringify(["NOTICE", "invalid: binary messages unsupported"]),
          );
          return;
        }

        void (async () => {
          const responses = await routeMessage(message, {
            connectionId: ws.data.connectionId,
          });
          for (const response of responses) {
            ws.send(JSON.stringify(response));
          }
        })();
      },
      close(ws) {
        connections.remove(ws.data.connectionId);
      },
    },
  });

  return {
    config,
    db,
    sql,
    server,
    genericEvents,
    revisions,
    heads,
    changes,
    compaction,
    settings,
    retention,
    connections,
    access,
    port: server.port,
    minSequence: changes.minSequence,
    minPayloadMtime: compaction.minPayloadMtime,
    stop: async () => {
      retention.stop();
      void server.stop(true);
      await sql.end({ timeout: 5 });
    },
  };
}

async function handleRetentionApiRequest(
  request: Request,
  options: {
    adminToken: string | null;
    settings: ReturnType<typeof createRelaySettingsStore>;
    retention: ReturnType<typeof createRetentionPolicyRuntime>;
  },
) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: adminJsonHeaders(),
    });
  }

  if (request.method === "GET") {
    const policy = await options.settings.getRetentionPolicy();
    return jsonResponse({
      payload_retention_days: policy.payloadRetentionDays,
      compaction_interval_seconds: policy.compactionIntervalSeconds,
      updated_at: policy.updatedAt,
    });
  }

  if (request.method === "PATCH") {
    if (!isAdminAuthorized(request, options.adminToken)) {
      return jsonResponse({ error: "unauthorized" }, { status: 401 });
    }

    const body = await parseJsonBody(request);
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse(
        { error: "invalid JSON object body" },
        { status: 400 },
      );
    }

    const payloadRetentionDays = parseNullableNonNegativeInteger(
      body.payload_retention_days,
    );
    if (payloadRetentionDays === "invalid") {
      return jsonResponse(
        {
          error:
            "payload_retention_days must be a non-negative integer or null",
        },
        { status: 400 },
      );
    }

    const compactionIntervalSeconds = parsePositiveInteger(
      body.compaction_interval_seconds,
    );
    if (compactionIntervalSeconds === "invalid") {
      return jsonResponse(
        { error: "compaction_interval_seconds must be a positive integer" },
        { status: 400 },
      );
    }

    const { policy, compactedRevisions } = await options.retention.applyPolicy({
      payloadRetentionDays:
        payloadRetentionDays === undefined ? undefined : payloadRetentionDays,
      compactionIntervalSeconds: compactionIntervalSeconds ?? undefined,
    });

    return jsonResponse({
      payload_retention_days: policy.payloadRetentionDays,
      compaction_interval_seconds: policy.compactionIntervalSeconds,
      updated_at: policy.updatedAt,
      compacted_revisions: compactedRevisions,
    });
  }

  return jsonResponse({ error: "method not allowed" }, { status: 405 });
}

async function truncateAll(db: RevisionRelayDb) {
  await db.execute(
    rawSql`TRUNCATE relay_allowed_users, relay_settings, sync_changes, sync_heads, sync_revision_parents, sync_revisions, sync_payloads, relay_event_tags, relay_events RESTART IDENTITY CASCADE`,
  );
}

function adminJsonHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return Response.json(body, {
    ...init,
    headers: {
      ...adminJsonHeaders(),
      ...(init.headers ?? {}),
    },
  });
}

function requireAdminTokenConfigured(token: string | null) {
  if (!token) {
    return jsonResponse({ error: "admin not configured" }, { status: 503 });
  }

  return null;
}

function requireAdminAuthorization(request: Request, token: string | null) {
  const configError = requireAdminTokenConfigured(token);
  if (configError) {
    return configError;
  }

  if (!isAdminAuthorized(request, token)) {
    return jsonResponse({ error: "unauthorized" }, { status: 401 });
  }

  return null;
}

async function parseJsonBody(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isAdminAuthorized(request: Request, token: string | null) {
  if (!token) {
    return true;
  }

  const authorization = request.headers.get("authorization");
  return authorization === `Bearer ${token}`;
}

async function handleAllowlistApiRequest(
  request: Request,
  options: {
    adminToken: string | null;
    access: ReturnType<typeof createAccessControl>;
  },
) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: adminJsonHeaders(),
    });
  }

  if (request.method === "GET") {
    const authError = requireAdminAuthorization(request, options.adminToken);
    if (authError) {
      return authError;
    }

    const users = await options.access.list();
    return jsonResponse({
      private_mode: options.access.privateMode,
      users: users.map((user) => ({
        pubkey: user.pubkey,
        expires_at: user.expiresAt,
        storage_limit_bytes: user.storageLimitBytes,
        created_at: user.createdAt,
      })),
    });
  }

  if (request.method === "POST") {
    const authError = requireAdminAuthorization(request, options.adminToken);
    if (authError) {
      return authError;
    }

    const body = await parseJsonBody(request);
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse(
        { error: "invalid JSON object body" },
        { status: 400 },
      );
    }

    const pubkey = typeof body.pubkey === "string" ? body.pubkey : "";
    if (!/^[a-f0-9]{64}$/.test(pubkey)) {
      return jsonResponse(
        { error: "pubkey must be a 64-character lowercase hex string" },
        { status: 400 },
      );
    }

    const expiresAt = parseNullableNonNegativeInteger(body.expires_at);
    if (expiresAt === "invalid") {
      return jsonResponse(
        { error: "expires_at must be a non-negative integer or null" },
        { status: 400 },
      );
    }

    const storageLimitBytes = parseNullableNonNegativeInteger(
      body.storage_limit_bytes,
    );
    if (storageLimitBytes === "invalid") {
      return jsonResponse(
        { error: "storage_limit_bytes must be a non-negative integer or null" },
        { status: 400 },
      );
    }

    await options.access.allow(
      pubkey,
      expiresAt === undefined ? null : expiresAt,
      storageLimitBytes === undefined ? undefined : storageLimitBytes,
    );

    return jsonResponse({
      allowed: true,
      pubkey,
      expires_at: expiresAt === undefined ? null : expiresAt,
      storage_limit_bytes:
        storageLimitBytes === undefined ? null : storageLimitBytes,
    });
  }

  return jsonResponse({ error: "method not allowed" }, { status: 405 });
}

async function handleAllowlistUserApiRequest(
  request: Request,
  options: {
    adminToken: string | null;
    access: ReturnType<typeof createAccessControl>;
    pubkey: string;
  },
) {
  if (request.method === "DELETE") {
    const authError = requireAdminAuthorization(request, options.adminToken);
    if (authError) {
      return authError;
    }

    if (!/^[a-f0-9]{64}$/.test(options.pubkey)) {
      return jsonResponse(
        { error: "pubkey must be a 64-character lowercase hex string" },
        { status: 400 },
      );
    }

    const revoked = await options.access.revoke(options.pubkey);
    return jsonResponse({ revoked, pubkey: options.pubkey });
  }

  return jsonResponse({ error: "method not allowed" }, { status: 405 });
}

function handleConnectionsApiRequest(
  request: Request,
  options: {
    adminToken: string | null;
    connections: ConnectionRegistry;
  },
) {
  if (request.method === "GET") {
    const authError = requireAdminAuthorization(request, options.adminToken);
    if (authError) {
      return authError;
    }

    const connections = [];
    for (const [id, state] of options.connections.entries()) {
      connections.push({
        id,
        authed_pubkeys: Array.from(state.authedPubkeys),
        live_changes_subscription_ids: Array.from(
          state.liveChangesSubscriptions.keys(),
        ),
      });
    }

    return jsonResponse({ connections });
  }

  return jsonResponse({ error: "method not allowed" }, { status: 405 });
}

function parseNullableNonNegativeInteger(
  value: unknown,
): number | null | undefined | "invalid" {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return "invalid";
  }
  return value;
}

function parsePositiveInteger(value: unknown): number | undefined | "invalid" {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return "invalid";
  }
  return value;
}
