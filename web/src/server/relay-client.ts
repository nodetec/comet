// RELAY_URL must be an HTTP URL (e.g., http://comet-relay.internal:3000),
// NOT the public WebSocket URL (wss://...).

export type RelayConnectionInfo = {
  id: string;
  access_key?: string | null;
  authed_pubkeys?: string[];
  authedPubkeys?: string[];
};

export type RelayAccessKey = {
  key: string;
  label: string | null;
  storage_limit_bytes: number | null;
  expires_at: number | null;
  revoked: boolean;
  created_at: number;
};

function getRelayAdminConfig() {
  const url = process.env.RELAY_URL;
  const token = process.env.ADMIN_TOKEN;

  if (!url || !token) {
    throw new Error("RELAY_URL or ADMIN_TOKEN not configured");
  }

  return { url, token };
}

async function relayAdminFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const { url, token } = getRelayAdminConfig();

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);

  return fetch(`${url}${path}`, {
    ...init,
    headers,
  });
}

export async function getRelayConnections(): Promise<{
  connections: {
    id: string;
    accessKey: string | null;
    authedPubkeys: string[];
  }[];
}> {
  try {
    const res = await relayAdminFetch("/admin/connections");
    if (!res.ok) {
      return { connections: [] };
    }

    const body = (await res.json()) as { connections: RelayConnectionInfo[] };
    return {
      connections: body.connections.map((connection) => ({
        id: connection.id,
        accessKey: connection.access_key ?? null,
        authedPubkeys:
          connection.authed_pubkeys ?? connection.authedPubkeys ?? [],
      })),
    };
  } catch {
    return { connections: [] };
  }
}

export async function listRelayAccessKeys(): Promise<{
  private_mode: boolean;
  keys: RelayAccessKey[];
}> {
  const res = await relayAdminFetch("/admin/keys");
  if (!res.ok) {
    throw new Error(`Relay keys request failed: ${res.status}`);
  }
  return res.json();
}

export async function createRelayAccessKey(input: {
  label?: string | null;
  expires_at?: number | null;
  storage_limit_bytes?: number | null;
}) {
  const res = await relayAdminFetch("/admin/keys", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`Relay key create failed: ${res.status}`);
  }
  return res.json() as Promise<{
    key: string;
    label: string | null;
    expires_at: number | null;
    storage_limit_bytes: number | null;
  }>;
}

export async function revokeRelayAccessKey(key: string) {
  const res = await relayAdminFetch(`/admin/keys/${encodeURIComponent(key)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ revoked: true }),
  });
  if (!res.ok) {
    throw new Error(`Relay key revoke failed: ${res.status}`);
  }
  return res.json();
}

export async function deleteRelayAccessKey(key: string) {
  const res = await relayAdminFetch(`/admin/keys/${encodeURIComponent(key)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(`Relay key delete failed: ${res.status}`);
  }
  return res.json();
}
