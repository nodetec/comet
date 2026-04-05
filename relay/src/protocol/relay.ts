import type { NostrEvent } from "@comet/nostr";

import type { AccessControl } from "../access";
import { classifyEvent } from "../domain/events/policy";
import { parseSnapshotEnvelope } from "../domain/snapshots/validation";
import type { KindPolicy } from "../domain/events/policy";
import {
  SNAPSHOT_SYNC_EVENT_KIND,
  type RelayFilter,
  type SnapshotChangesFilter,
} from "../types";
import { publishGenericEvent } from "../application/relay/publish-event";
import { publishSnapshot } from "../application/snapshots/publish-snapshot";
import type { GenericEventStore } from "../storage/events";
import type { SnapshotStore } from "../storage/snapshots";
import type { ChangeStore } from "../storage/changes";
import type { ConnectionRegistry } from "../infra/connections";
import {
  isAuthorizedForChangesFilter,
  isAuthorizedForSnapshotFilters,
  isAuthorizedForSnapshotAuthor,
  validateAuthEvent,
} from "./auth";
import {
  type ChangesEventMessage,
  type ChangesSnapshotMessage,
  type ChangesStatusMessage,
  isChangesRequestMessage,
} from "./changes";

export type EventMessage = ["EVENT", NostrEvent];
export type AuthMessage = ["AUTH", NostrEvent];
export type ReqMessage = ["REQ", string, ...RelayFilter[]];
export type ReqBatchMessage = ["REQ-BATCH", string, ...RelayFilter[]];
export type CloseMessage = ["CLOSE", string];
export type OkMessage = ["OK", string, boolean, string];
export type NoticeMessage = ["NOTICE", string];
export type ClosedMessage = ["CLOSED", string, string];
export type EoseMessage = ["EOSE", string];
export type EventStatusMessage = [
  "EVENT-STATUS",
  string,
  { id: string; status: "payload_compacted" },
];

export type ClientMessage =
  | EventMessage
  | AuthMessage
  | ReqMessage
  | ReqBatchMessage
  | CloseMessage;

export type ServerMessage =
  | OkMessage
  | NoticeMessage
  | ClosedMessage
  | EoseMessage
  | EventStatusMessage
  | ChangesEventMessage
  | ChangesSnapshotMessage
  | ChangesStatusMessage
  | ["EVENT", string, NostrEvent]
  | ["EVENTS", string, NostrEvent[]]
  | ["CHANGES", string, "STATUS", { mode: "bootstrap"; snapshot_seq: number }]
  | ["CHANGES", string, "SNAPSHOT", NostrEvent]
  | ["CHANGES", string, "EOSE", number]
  | ["CHANGES", string, "ERR", string];

export type ClientMessageHandler = (
  raw: string,
  context: { connectionId: string },
) => Promise<ServerMessage[]>;

export function parseClientMessage(raw: string): unknown[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isEventMessage(value: unknown): value is EventMessage {
  return Array.isArray(value) && value.length === 2 && value[0] === "EVENT";
}

function isAuthMessage(value: unknown): value is AuthMessage {
  return Array.isArray(value) && value.length === 2 && value[0] === "AUTH";
}

function isReqMessage(value: unknown): value is ReqMessage {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    value[0] === "REQ" &&
    typeof value[1] === "string" &&
    value
      .slice(2)
      .every(
        (filter) =>
          typeof filter === "object" &&
          filter !== null &&
          !Array.isArray(filter),
      )
  );
}

function isReqCommand(value: unknown): value is unknown[] {
  return Array.isArray(value) && value[0] === "REQ";
}

function isReqBatchMessage(value: unknown): value is ReqBatchMessage {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    value[0] === "REQ-BATCH" &&
    typeof value[1] === "string" &&
    value
      .slice(2)
      .every(
        (filter) =>
          typeof filter === "object" &&
          filter !== null &&
          !Array.isArray(filter),
      )
  );
}

function isReqBatchCommand(value: unknown): value is unknown[] {
  return Array.isArray(value) && value[0] === "REQ-BATCH";
}

function isCloseMessage(value: unknown): value is CloseMessage {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value[0] === "CLOSE" &&
    typeof value[1] === "string"
  );
}

export function createClientMessageHandler(options: {
  kindPolicy: KindPolicy;
  changeStore: ChangeStore;
  genericEventStore: GenericEventStore;
  snapshotStore: SnapshotStore;
  connections: ConnectionRegistry;
  access: AccessControl;
}): ClientMessageHandler {
  return async (raw, context) => {
    const parsed = parseClientMessage(raw);
    if (!parsed) {
      return [["NOTICE", "invalid: expected a JSON array message"]];
    }

    if (isEventMessage(parsed)) {
      const event = parsed[1];
      const authedPubkeys = options.connections.getAuthedPubkeys(
        context.connectionId,
      );
      const snapshotEnvelope = parseSnapshotEnvelope(event);
      if (snapshotEnvelope) {
        if (options.access.privateMode) {
          const auth = isAuthorizedForSnapshotAuthor(
            snapshotEnvelope.authorPubkey,
            authedPubkeys,
          );
          if (!auth.authorized) {
            return [["OK", event.id, false, auth.reason]];
          }
        }

        const result = await publishSnapshot({
          store: options.snapshotStore,
          envelope: snapshotEnvelope,
        });

        if (result.stored && result.seq !== undefined) {
          options.connections.broadcastRevisionChange({
            seq: result.seq,
            event,
            authorPubkey: snapshotEnvelope.authorPubkey,
            documentCoord: snapshotEnvelope.documentCoord,
          });
        }

        return [
          [
            "OK",
            event.id,
            result.stored,
            result.stored
              ? `stored: snapshot ${event.id}`
              : (result.reason ?? "duplicate: snapshot exists"),
          ],
        ];
      }

      if (event.kind === SNAPSHOT_SYNC_EVENT_KIND) {
        return [
          [
            "OK",
            event.id,
            false,
            "invalid: missing or malformed snapshot metadata",
          ],
        ];
      }

      if (options.access.privateMode && authedPubkeys.size === 0) {
        return [
          [
            "OK",
            event.id,
            false,
            "auth-required: this relay requires authentication",
          ],
        ];
      }

      const classification = classifyEvent(event, options.kindPolicy);
      if (classification === "companion" || classification === "pass-through") {
        const result = await publishGenericEvent({
          store: options.genericEventStore,
          event,
        });
        return [
          [
            "OK",
            event.id,
            result.stored,
            result.stored
              ? `stored: ${classification} event kind=${event.kind}`
              : (result.reason ?? `duplicate: ${classification} event exists`),
          ],
        ];
      }

      return [
        [
          "OK",
          event.id,
          false,
          "unsupported: non-snapshot event kind requires explicit classification",
        ],
      ];
    }

    if (isAuthMessage(parsed)) {
      const event = parsed[1];
      const challenge = options.connections.getChallenge(context.connectionId);
      const result = validateAuthEvent(event, challenge);

      if (result.ok && result.pubkey) {
        if (
          options.access.privateMode &&
          !(await options.access.isAllowed(result.pubkey))
        ) {
          return [
            [
              "OK",
              event.id,
              false,
              "restricted: pubkey not authorized on this relay",
            ],
          ];
        }

        options.connections.addAuthedPubkey(
          context.connectionId,
          result.pubkey,
        );
        return [["OK", event.id, true, ""]];
      }

      return [["OK", event.id, false, result.reason]];
    }

    if (isReqCommand(parsed) && !isReqMessage(parsed)) {
      return [
        [
          "NOTICE",
          "invalid: REQ requires a string subscription id and object filters",
        ],
      ];
    }

    if (isReqBatchCommand(parsed) && !isReqBatchMessage(parsed)) {
      return [
        [
          "NOTICE",
          "invalid: REQ-BATCH requires a string subscription id and object filters",
        ],
      ];
    }

    if (isReqMessage(parsed)) {
      const message = parsed as ReqMessage;
      if (options.access.privateMode) {
        const auth = isAuthorizedForSnapshotFilters(
          message.slice(2) as RelayFilter[],
          options.connections.getAuthedPubkeys(context.connectionId),
        );
        if (!auth.authorized) {
          return [["CLOSED", message[1], auth.reason]];
        }
      }

      const snapshotEvents = await options.snapshotStore.querySnapshotEvents(
        message.slice(2) as RelayFilter[],
      );
      const compactedSnapshotIds =
        await options.snapshotStore.queryCompactedSnapshotIds(
          message.slice(2) as RelayFilter[],
        );
      return [
        ...snapshotEvents.map(
          (event): ServerMessage => ["EVENT", message[1], event],
        ),
        ...compactedSnapshotIds.map(
          (id): ServerMessage => [
            "EVENT-STATUS",
            message[1],
            { id, status: "payload_compacted" },
          ],
        ),
        ["EOSE", message[1]],
      ];
    }

    if (isReqBatchMessage(parsed)) {
      const message = parsed as ReqBatchMessage;
      if (options.access.privateMode) {
        const auth = isAuthorizedForSnapshotFilters(
          message.slice(2) as RelayFilter[],
          options.connections.getAuthedPubkeys(context.connectionId),
        );
        if (!auth.authorized) {
          return [["CLOSED", message[1], auth.reason]];
        }
      }

      const snapshotEvents = await options.snapshotStore.querySnapshotEvents(
        message.slice(2) as RelayFilter[],
      );
      const compactedSnapshotIds =
        await options.snapshotStore.queryCompactedSnapshotIds(
          message.slice(2) as RelayFilter[],
        );
      const eventBatches = chunkEvents(snapshotEvents);

      return [
        ...eventBatches.map(
          (events): ServerMessage => ["EVENTS", message[1], events],
        ),
        ...compactedSnapshotIds.map(
          (id): ServerMessage => [
            "EVENT-STATUS",
            message[1],
            { id, status: "payload_compacted" },
          ],
        ),
        ["EOSE", message[1]],
      ];
    }

    if (isCloseMessage(parsed)) {
      options.connections.removeLiveChangesSubscription(
        context.connectionId,
        parsed[1],
      );
      return [["CLOSED", parsed[1], "closed"]];
    }

    if (isChangesRequestMessage(parsed)) {
      const subscriptionId = parsed[1];
      const filter: SnapshotChangesFilter = parsed[2];

      if (options.access.privateMode) {
        const auth = isAuthorizedForChangesFilter(
          filter,
          options.connections.getAuthedPubkeys(context.connectionId),
        );
        if (!auth.authorized) {
          return [["CHANGES", subscriptionId, "ERR", auth.reason]];
        }
      }

      try {
        const mode = filter.mode ?? "tail";
        if (mode === "bootstrap") {
          const snapshotSeq = await options.changeStore.currentSequence();
          const bootstrapEvents =
            await options.changeStore.queryBootstrapSnapshotEvents({
              ...filter,
              live: false,
            });

          return [
            [
              "CHANGES",
              subscriptionId,
              "STATUS",
              { mode: "bootstrap", snapshot_seq: snapshotSeq },
            ],
            ...bootstrapEvents.map(
              (event): ServerMessage => [
                "CHANGES",
                subscriptionId,
                "SNAPSHOT",
                event,
              ],
            ),
            ["CHANGES", subscriptionId, "EOSE", snapshotSeq],
          ];
        }

        const events =
          await options.changeStore.queryStoredSnapshotEvents(filter);
        const lastSeq = await options.changeStore.currentSequence();
        if (filter.live === true) {
          options.connections.addLiveChangesSubscription(
            context.connectionId,
            subscriptionId,
            filter,
          );
        }
        return [
          ...events.map(
            (item): ServerMessage => [
              "CHANGES",
              subscriptionId,
              "EVENT",
              item.seq,
              item.event,
            ],
          ),
          ["CHANGES", subscriptionId, "EOSE", lastSeq],
        ];
      } catch (error) {
        return [
          [
            "CHANGES",
            subscriptionId,
            "ERR",
            error instanceof Error ? error.message : "unknown changes error",
          ],
        ];
      }
    }

    return [["NOTICE", "unsupported: message routing skeleton only"]];
  };
}

const MAX_EVENTS_PER_BATCH = 128;

function chunkEvents(events: NostrEvent[]): NostrEvent[][] {
  const batches: NostrEvent[][] = [];

  for (let index = 0; index < events.length; index += MAX_EVENTS_PER_BATCH) {
    batches.push(events.slice(index, index + MAX_EVENTS_PER_BATCH));
  }

  return batches;
}
