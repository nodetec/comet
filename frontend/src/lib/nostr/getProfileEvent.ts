import { type Relay } from "&/comet/backend/models/models";
import { SimplePool } from "nostr-tools";

export async function getProfileEvent(
  relays: Relay[] | null | undefined,
  publicKey: string | undefined,
) {
  if (!publicKey) return null;
  if (!relays) return null;

  const pool = new SimplePool();

  const relayUrls = relays.map((relay) => relay.URL);

  const profileEvent = await pool.get(relayUrls, {
    kinds: [0],
    authors: [publicKey],
  });

  pool.close(relayUrls);

  return profileEvent;
}
