// RELAY_URL must be an HTTP URL (e.g., http://comet-relay.internal:3000),
// NOT the public WebSocket URL (wss://...).

export type RelayConnectionInfo = {
  id: string;
  authed_pubkeys?: string[];
  authedPubkeys?: string[];
};

export type RelayAllowedUser = {
  pubkey: string;
  expires_at: number | null;
  storage_limit_bytes: number | null;
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
  connections: { id: string; authedPubkeys: string[] }[];
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
        authedPubkeys:
          connection.authed_pubkeys ?? connection.authedPubkeys ?? [],
      })),
    };
  } catch {
    return { connections: [] };
  }
}

export async function listRelayAllowedUsers(): Promise<{
  private_mode: boolean;
  users: RelayAllowedUser[];
}> {
  const res = await relayAdminFetch("/admin/allowlist");
  if (!res.ok) {
    throw new Error(`Relay allowlist request failed: ${res.status}`);
  }
  return res.json();
}

export async function allowRelayUser(input: {
  pubkey: string;
  expires_at?: number | null;
  storage_limit_bytes?: number | null;
}) {
  const res = await relayAdminFetch("/admin/allowlist", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`Relay allowlist update failed: ${res.status}`);
  }
  return res.json();
}

export async function revokeRelayUser(pubkey: string) {
  const res = await relayAdminFetch(
    `/admin/allowlist/${encodeURIComponent(pubkey)}`,
    {
      method: "DELETE",
    },
  );
  if (!res.ok) {
    throw new Error(`Relay allowlist revoke failed: ${res.status}`);
  }
  return res.json();
}
