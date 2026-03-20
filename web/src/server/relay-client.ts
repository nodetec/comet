// RELAY_URL must be an HTTP URL (e.g., http://comet-relay.internal:3000),
// NOT the public WebSocket URL (wss://...). On Fly.io, use private networking.
export async function getRelayConnections(): Promise<{
  connections: { id: string; authedPubkeys: string[] }[];
}> {
  const url = process.env.RELAY_URL;
  const token = process.env.ADMIN_TOKEN;
  if (!url || !token) {
    return { connections: [] };
  }
  const res = await fetch(`${url}/admin/connections`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    return { connections: [] };
  }
  return res.json();
}
