import type { NostrEvent } from "./client";

export interface Rumor {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
}

/**
 * Unwrap a kind 1059 gift wrap event using NIP-07 extension.
 *
 * Step 1: Decrypt wrap content with wrap.pubkey to get seal JSON
 * Step 2: Decrypt seal content with seal.pubkey to get rumor JSON
 */
export async function unwrapGiftWrap(wrap: NostrEvent): Promise<Rumor> {
  if (!window.nostr?.nip44) {
    throw new Error("NIP-07 extension with NIP-44 support required");
  }

  // Step 1: Decrypt the gift wrap content to get the seal
  const sealJson = await window.nostr.nip44.decrypt(wrap.pubkey, wrap.content);
  const seal = JSON.parse(sealJson) as { pubkey: string; content: string };

  // Step 2: Decrypt the seal content to get the rumor
  const rumorJson = await window.nostr.nip44.decrypt(seal.pubkey, seal.content);
  const rumor = JSON.parse(rumorJson) as Rumor;

  return rumor;
}
