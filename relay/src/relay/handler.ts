import type { NostrEvent, Filter } from "../types";
import type { Storage } from "./storage";
import type { AccessControl } from "../access";
import type { ConnectionManager } from "../connections";
import type { ChangeEntry } from "../types";
import { validateAndVerifyEvent, getEventKindCategory } from "./event";
import { validateLongFormEvent } from "./nip/23";
import { isDeletionEvent, validateDeletionEvent } from "./nip/09";
import { validateGiftWrap, validateSeal } from "./nip/59";
import {
  validateAuthEvent,
  isAuthorizedForFilter,
  isAuthorizedForChangesFilter,
  KIND_AUTH,
} from "./nip/42";
import {
  isValidChangesFilter,
  handleChangesRequest,
  broadcastChanges,
  removeChangesSubscription,
  removeAllChangesSubscriptions,
} from "./nip/cf";
import {
  addSubscription,
  removeSubscription,
  removeAllSubscriptions,
  broadcastEvent,
} from "./subscription";

export type RelayDeps = {
  storage: Storage;
  connections: ConnectionManager;
  relayUrl: string;
  access: AccessControl;
};

type MessageType = "EVENT" | "AUTH" | "REQ" | "CHANGES" | "CLOSE";

const textDecoder = new TextDecoder();

function decodeMessage(raw: string | ArrayBuffer | Uint8Array): string {
  if (typeof raw === "string") {
    return raw;
  }
  if (raw instanceof ArrayBuffer) {
    return textDecoder.decode(new Uint8Array(raw));
  }
  return textDecoder.decode(raw);
}

function send(connId: string, connections: ConnectionManager, msg: unknown) {
  connections.sendJSON(connId, msg);
}

function getEventId(event: unknown): string {
  if (!event || typeof event !== "object") {
    return "";
  }

  const { id } = event as { id?: unknown };
  return typeof id === "string" ? id : "";
}

function isMessageType(value: unknown): value is MessageType {
  return (
    value === "EVENT" ||
    value === "AUTH" ||
    value === "REQ" ||
    value === "CHANGES" ||
    value === "CLOSE"
  );
}

/** In private mode, require authentication for all operations. */
function requirePrivateAuth(
  connId: string,
  connections: ConnectionManager,
  access: AccessControl,
): string | null {
  if (!access.privateMode) {
    return null;
  }
  if (connections.getAuthedPubkeys(connId).size === 0) {
    return "auth-required: this relay requires authentication";
  }
  return null;
}

function isValidFilter(f: unknown): f is Filter {
  if (!f || typeof f !== "object") {
    return false;
  }
  const filter = f as Record<string, unknown>;
  for (const [key, value] of Object.entries(filter)) {
    switch (key) {
      case "ids":
      case "authors":
      case "kinds":
        if (!Array.isArray(value)) {
          return false;
        }
        break;
      case "since":
      case "until":
      case "limit":
        if (typeof value !== "number") {
          return false;
        }
        break;
      default:
        if (key[0] === "#") {
          if (!Array.isArray(value)) {
            return false;
          }
        }
        break;
    }
  }
  return true;
}

export async function handleMessage(
  connId: string,
  raw: string | ArrayBuffer | Uint8Array,
  deps: RelayDeps,
): Promise<void> {
  let msg: unknown;
  try {
    msg = JSON.parse(decodeMessage(raw));
  } catch {
    send(connId, deps.connections, ["NOTICE", "error: invalid JSON"]);
    return;
  }

  if (!Array.isArray(msg) || msg.length < 2) {
    send(connId, deps.connections, [
      "NOTICE",
      "error: message must be a JSON array",
    ]);
    return;
  }

  const message = msg as unknown[];
  const type = message[0];

  if (!isMessageType(type)) {
    send(connId, deps.connections, [
      "NOTICE",
      `error: unknown message type: ${String(type)}`,
    ]);
    return;
  }

  switch (type) {
    case "EVENT":
      await handleEvent(connId, message[1], deps);
      break;
    case "AUTH":
      await handleAuth(connId, message[1], deps);
      break;
    case "REQ":
      await handleReq(connId, message as [string, string, ...unknown[]], deps);
      break;
    case "CHANGES":
      await handleChanges(connId, message, deps);
      break;
    case "CLOSE":
      handleClose(connId, message[1], deps);
      break;
  }
}

async function handleEvent(
  connId: string,
  event: unknown,
  deps: RelayDeps,
): Promise<void> {
  const { connections, access, storage } = deps;

  // Private mode: require auth for writes
  const privateCheck = requirePrivateAuth(connId, connections, access);
  if (privateCheck) {
    const id = getEventId(event);
    send(connId, connections, ["OK", id, false, privateCheck]);
    return;
  }

  const validation = validateAndVerifyEvent(event);
  if (!validation.ok) {
    const id = getEventId(event);
    console.log(
      `[EVENT] rejected id=${id.slice(0, 8)}… reason="${validation.reason}"`,
    );
    send(connId, connections, ["OK", id, false, validation.reason]);
    return;
  }

  const e = event as NostrEvent;

  // NIP-42: kind:22242 events must not be stored or broadcast
  if (e.kind === KIND_AUTH) {
    send(connId, connections, [
      "OK",
      e.id,
      false,
      "invalid: AUTH events should be sent via AUTH message, not EVENT",
    ]);
    return;
  }

  console.log(
    `[EVENT] received kind=${e.kind} id=${e.id.slice(0, 8)}… pubkey=${e.pubkey.slice(0, 8)}…`,
  );

  // NIP-23 validation for long-form content
  const nip23Rejection = validateLongFormEvent(e);
  if (nip23Rejection) {
    console.log(
      `[EVENT] rejected id=${e.id.slice(0, 8)}… reason="${nip23Rejection}"`,
    );
    send(connId, connections, ["OK", e.id, false, nip23Rejection]);
    return;
  }

  // NIP-59 validation for gift wraps and seals
  const nip59Rejection = validateGiftWrap(e) ?? validateSeal(e);
  if (nip59Rejection) {
    console.log(
      `[EVENT] rejected id=${e.id.slice(0, 8)}… reason="${nip59Rejection}"`,
    );
    send(connId, connections, ["OK", e.id, false, nip59Rejection]);
    return;
  }

  // NIP-09 validation for deletion requests
  if (isDeletionEvent(e)) {
    const nip09Rejection = validateDeletionEvent(e);
    if (nip09Rejection) {
      console.log(
        `[EVENT] rejected id=${e.id.slice(0, 8)}… reason="${nip09Rejection}"`,
      );
      send(connId, connections, ["OK", e.id, false, nip09Rejection]);
      return;
    }
  }

  const category = getEventKindCategory(e.kind);

  // Ephemeral events: broadcast but don't store
  if (category === "ephemeral") {
    console.log(`[EVENT] ephemeral id=${e.id.slice(0, 8)}… (broadcast only)`);
    send(connId, connections, ["OK", e.id, true, ""]);
    broadcastEvent(e, connections);
    return;
  }

  const result = await storage.saveEvent(e);
  if (result.saved) {
    const allChanges: ChangeEntry[] = [...result.changes];

    // NIP-09: process deletion after storing the deletion event itself
    if (isDeletionEvent(e)) {
      const { deleted, changes: delChanges } =
        await storage.processDeletionRequest(e);
      allChanges.push(...delChanges);
      console.log(
        `[EVENT] deletion id=${e.id.slice(0, 8)}… deleted=${deleted} events`,
      );
    } else {
      console.log(
        `[EVENT] saved id=${e.id.slice(0, 8)}… kind=${e.kind} category=${category}`,
      );
    }

    send(connId, connections, ["OK", e.id, true, ""]);
    broadcastEvent(e, connections);

    // NIP-CF: broadcast changelog entries to live CHANGES subscribers
    await broadcastChanges(allChanges, storage, connections, e);
  } else {
    console.log(
      `[EVENT] not saved id=${e.id.slice(0, 8)}… reason="${result.reason}"`,
    );
    // Duplicates return OK with true per NIP-01 (already have it)
    const isDuplicate = result.reason?.startsWith("duplicate:");
    send(connId, connections, [
      "OK",
      e.id,
      isDuplicate ?? false,
      result.reason ?? "",
    ]);
  }
}

async function handleAuth(
  connId: string,
  event: unknown,
  deps: RelayDeps,
): Promise<void> {
  const { connections, access } = deps;
  const challenge = connections.getChallenge(connId);
  const result = validateAuthEvent(event, challenge, deps.relayUrl);
  const id = getEventId(event);

  if (result.ok && result.pubkey) {
    // Check allowlist in private mode
    if (access.privateMode && !(await access.isAllowed(result.pubkey))) {
      console.log(
        `[AUTH] rejected pubkey=${result.pubkey.slice(0, 8)}… reason="not on allowlist"`,
      );
      send(connId, connections, [
        "OK",
        id,
        false,
        "restricted: pubkey not authorized on this relay",
      ]);
      return;
    }
    connections.addAuthedPubkey(connId, result.pubkey);
    console.log(`[AUTH] authenticated pubkey=${result.pubkey.slice(0, 8)}…`);
    send(connId, connections, ["OK", id, true, ""]);
  } else {
    console.log(`[AUTH] rejected reason="${result.reason}"`);
    send(connId, connections, ["OK", id, false, result.reason]);
  }
}

async function handleReq(
  connId: string,
  msg: [string, string, ...unknown[]],
  deps: RelayDeps,
): Promise<void> {
  const { connections, access, storage } = deps;

  if (msg.length < 3) {
    send(connId, connections, [
      "NOTICE",
      "error: REQ must include subscription id and at least one filter",
    ]);
    return;
  }

  const subId = msg[1];
  if (typeof subId !== "string" || subId.length === 0 || subId.length > 64) {
    send(connId, connections, ["NOTICE", "error: invalid subscription id"]);
    return;
  }

  // Private mode: require auth for reads
  const privateCheck = requirePrivateAuth(connId, connections, access);
  if (privateCheck) {
    send(connId, connections, ["CLOSED", subId, privateCheck]);
    return;
  }

  const filters: Filter[] = [];
  for (let i = 2; i < msg.length; i++) {
    if (!isValidFilter(msg[i])) {
      send(connId, connections, ["CLOSED", subId, "error: invalid filter"]);
      return;
    }
    filters.push(msg[i] as Filter);
  }

  // NIP-42: check auth for kind:1059 queries
  const authedPubkeys = connections.getAuthedPubkeys(connId);
  for (const filter of filters) {
    const auth = isAuthorizedForFilter(filter, authedPubkeys);
    if (!auth.authorized) {
      send(connId, connections, ["CLOSED", subId, auth.reason]);
      return;
    }
  }

  await addSubscription(connId, subId, filters, storage, connections);
}

async function handleChanges(
  connId: string,
  msg: unknown[],
  deps: RelayDeps,
): Promise<void> {
  const { connections, access, storage } = deps;

  if (msg.length < 3) {
    send(connId, connections, [
      "NOTICE",
      "error: CHANGES must include subscription id and filter",
    ]);
    return;
  }

  const subId = msg[1];
  if (typeof subId !== "string" || subId.length === 0 || subId.length > 64) {
    send(connId, connections, ["NOTICE", "error: invalid subscription id"]);
    return;
  }

  // Private mode: require auth for reads
  const privateCheck = requirePrivateAuth(connId, connections, access);
  if (privateCheck) {
    send(connId, connections, ["CHANGES", subId, "ERR", privateCheck]);
    return;
  }

  if (!isValidChangesFilter(msg[2])) {
    send(connId, connections, ["CHANGES", subId, "ERR", "invalid filter"]);
    return;
  }

  // NIP-42: check auth for kind:1059 queries
  const authedPubkeys = connections.getAuthedPubkeys(connId);
  const auth = isAuthorizedForChangesFilter(msg[2], authedPubkeys);
  if (!auth.authorized) {
    send(connId, connections, ["CHANGES", subId, "ERR", auth.reason]);
    return;
  }

  console.log(
    `[CHANGES] subscription id=${subId} since=${msg[2].since ?? 0} live=${msg[2].live ?? false}`,
  );
  await handleChangesRequest(connId, subId, msg[2], storage, connections);
}

function handleClose(connId: string, subId: unknown, deps?: RelayDeps): void {
  if (typeof subId !== "string") {
    if (deps) {
      send(connId, deps.connections, [
        "NOTICE",
        "error: CLOSE requires a subscription id string",
      ]);
    }
    return;
  }
  removeSubscription(connId, subId);
  removeChangesSubscription(connId, subId);
}

export function handleDisconnect(connId: string, deps: RelayDeps): void {
  removeAllSubscriptions(connId);
  removeAllChangesSubscriptions(connId);
  deps.connections.remove(connId);
}
