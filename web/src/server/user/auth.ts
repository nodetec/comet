import { createServerFn } from "@tanstack/react-start";
import { verifyEvent, type Event } from "nostr-tools/pure";
import {
  setUserSession,
  clearUserSession,
  getUserPubkey,
} from "~/server/middleware";

export const userLogin = createServerFn({ method: "POST" })
  .inputValidator((data: { signedEvent: Event }) => data)
  .handler(async ({ data }) => {
    const event = data.signedEvent;

    if (event.kind !== 27235) {
      return { ok: false, error: "invalid event kind" };
    }

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(event.created_at - now) > 120) {
      return { ok: false, error: "event timestamp too far from current time" };
    }

    if (!verifyEvent(event)) {
      return { ok: false, error: "invalid signature" };
    }

    setUserSession(event.pubkey);
    return { ok: true, pubkey: event.pubkey };
  });

export const userLogout = createServerFn({ method: "POST" }).handler(
  async () => {
    clearUserSession();
    return { ok: true };
  },
);

export const checkUserAuth = createServerFn({ method: "GET" }).handler(
  async () => {
    const pubkey = getUserPubkey();
    return { pubkey };
  },
);
