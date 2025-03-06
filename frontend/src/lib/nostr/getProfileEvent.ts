import { SimplePool } from "nostr-tools";

export async function getProfileEvent(
  relays: string[] | undefined,
  publicKey: string | undefined,
) {
  if (!publicKey) return null;
  if (!relays) return null;

  const pool = new SimplePool();

  const profileEvent = await pool.get(relays, {
    kinds: [0],
    authors: [publicKey],
  });

  pool.close(relays);

  return profileEvent;
}
