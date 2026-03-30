import { nip19 } from "nostr-tools";

export function pubkeyToNpub(pubkey: string): string {
  try {
    return nip19.npubEncode(pubkey);
  } catch {
    return pubkey;
  }
}

export function shortNpub(pubkey: string, start = 16, end = 8): string {
  const npub = pubkeyToNpub(pubkey);
  if (npub.length <= start + end + 1) {
    return npub;
  }
  return `${npub.slice(0, start)}\u2026${npub.slice(-end)}`;
}

export function resolvePubkeyInput(input: string): string | null {
  const trimmed = input.trim();
  if (/^[a-f0-9]{64}$/.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith("npub1")) {
    try {
      const { type, data } = nip19.decode(trimmed);
      if (type === "npub" && typeof data === "string") {
        return data;
      }
    } catch {
      return null;
    }
  }
  return null;
}
