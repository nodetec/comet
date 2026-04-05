import type { NostrEvent } from "@comet/nostr";

import type { AccessControl } from "../access";
import { classifyEvent } from "../domain/events/policy";
import { parseRevisionEnvelope } from "../domain/revisions/validation";
import { createNegentropySessionManager } from "../application/revisions/negentropy-sessions";
import type { KindPolicy } from "../domain/events/policy";
import {
  REVISION_SYNC_EVENT_KIND,
  type RelayFilter,
  type RevisionChangesFilter,
} from "../types";
import { publishGenericEvent } from "../application/relay/publish-event";
import { publishRevision } from "../application/revisions/publish-revision";
import type { GenericEventStore } from "../storage/events";
import type { RevisionStore } from "../storage/revisions";
import type { ChangeStore } from "../storage/changes";
import type { HeadStore } from "../storage/heads";
import type { ConnectionRegistry } from "../infra/connections";
import {
  isAuthorizedForChangesFilter,
  isAuthorizedForRevisionFilters,
  isAuthorizedForRevisionAuthor,
  validateAuthEvent,
} from "./auth";
import {
  createNegErrMessage,
  type NegMsgMessage,
  type NegErrMessage,
  type NegStatusMessage,
  isNegCloseMessage,
  isNegMsgMessage,
  isNegOpenMessage,
} from "./negentropy";
import { type ChangesEventMessage, isChangesRequestMessage } from "./changes";

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
  { rev: string; status: "payload_compacted" },
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
  | NegMsgMessage
  | NegErrMessage
  | NegStatusMessage
  | ["EVENT", string, NostrEvent]
  | ["EVENTS", string, NostrEvent[]]
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
  revisionStore: RevisionStore;
  headStore: HeadStore;
  connections: ConnectionRegistry;
  access: AccessControl;
}): ClientMessageHandler {
  const negentropySessions = createNegentropySessionManager({
    headStore: options.headStore,
    changeStore: options.changeStore,
  });

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
      const revisionEnvelope = parseRevisionEnvelope(event);
      if (revisionEnvelope) {
        if (options.access.privateMode) {
          const auth = isAuthorizedForRevisionAuthor(
            revisionEnvelope.authorPubkey,
            authedPubkeys,
          );
          if (!auth.authorized) {
            return [["OK", event.id, false, auth.reason]];
          }
        }

        const result = await publishRevision({
          store: options.revisionStore,
          envelope: revisionEnvelope,
        });

        if (result.stored && result.seq !== undefined) {
          options.connections.broadcastRevisionChange({
            seq: result.seq,
            event,
            authorPubkey: revisionEnvelope.authorPubkey,
            documentCoord: revisionEnvelope.documentCoord,
            revisionId: revisionEnvelope.revisionId,
          });
        }

        return [
          [
            "OK",
            event.id,
            result.stored,
            result.stored
              ? `stored: revision ${revisionEnvelope.revisionId}`
              : (result.reason ?? "duplicate: revision exists"),
          ],
        ];
      }

      if (event.kind === REVISION_SYNC_EVENT_KIND) {
        return [
          [
            "OK",
            event.id,
            false,
            "invalid: missing or malformed revision metadata",
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
          "unsupported: non-revision event kind requires explicit classification",
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
        const auth = isAuthorizedForRevisionFilters(
          message.slice(2) as RelayFilter[],
          options.connections.getAuthedPubkeys(context.connectionId),
        );
        if (!auth.authorized) {
          return [["CLOSED", message[1], auth.reason]];
        }
      }

      const revisionEvents = await options.revisionStore.queryRevisionEvents(
        message.slice(2) as RelayFilter[],
      );
      const compactedRevisionIds =
        await options.revisionStore.queryCompactedRevisionIds(
          message.slice(2) as RelayFilter[],
        );
      return [
        ...revisionEvents.map(
          (event): ServerMessage => ["EVENT", message[1], event],
        ),
        ...compactedRevisionIds.map(
          (rev): ServerMessage => [
            "EVENT-STATUS",
            message[1],
            { rev, status: "payload_compacted" },
          ],
        ),
        ["EOSE", message[1]],
      ];
    }

    if (isReqBatchMessage(parsed)) {
      const message = parsed as ReqBatchMessage;
      if (options.access.privateMode) {
        const auth = isAuthorizedForRevisionFilters(
          message.slice(2) as RelayFilter[],
          options.connections.getAuthedPubkeys(context.connectionId),
        );
        if (!auth.authorized) {
          return [["CLOSED", message[1], auth.reason]];
        }
      }

      const revisionEvents = await options.revisionStore.queryRevisionEvents(
        message.slice(2) as RelayFilter[],
      );
      const compactedRevisionIds =
        await options.revisionStore.queryCompactedRevisionIds(
          message.slice(2) as RelayFilter[],
        );
      const eventBatches = chunkEvents(revisionEvents);

      return [
        ...eventBatches.map(
          (events): ServerMessage => ["EVENTS", message[1], events],
        ),
        ...compactedRevisionIds.map(
          (rev): ServerMessage => [
            "EVENT-STATUS",
            message[1],
            { rev, status: "payload_compacted" },
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
      const filter: RevisionChangesFilter = parsed[2];

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
        const events =
          await options.changeStore.queryStoredRevisionEvents(filter);
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

    if (isNegOpenMessage(parsed)) {
      if (options.access.privateMode) {
        const auth = isAuthorizedForChangesFilter(
          parsed[2],
          options.connections.getAuthedPubkeys(context.connectionId),
        );
        if (!auth.authorized) {
          return [createNegErrMessage(parsed[1], auth.reason)];
        }
      }

      try {
        return [await negentropySessions.open(parsed)];
      } catch (error) {
        return [
          createNegErrMessage(
            parsed[1],
            error instanceof Error ? error.message : "unknown negentropy error",
          ),
        ];
      }
    }

    if (isNegMsgMessage(parsed)) {
      try {
        return [await negentropySessions.reconcile(parsed)];
      } catch (error) {
        return [
          createNegErrMessage(
            parsed[1],
            error instanceof Error ? error.message : "unknown negentropy error",
          ),
        ];
      }
    }

    if (isNegCloseMessage(parsed)) {
      negentropySessions.close(parsed[1]);
      return [["CLOSED", parsed[1], "negentropy session closed"]];
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
