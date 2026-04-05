import {
  createNegentropySession,
  type NegentropySession,
} from "../../domain/revisions/negentropy-adapter";
import type { HeadStore } from "../../storage/heads";
import type { RevisionScope } from "../../types";
import {
  createNegMsgMessage,
  createNegStatusMessage,
  type NegOpenMessage,
  type NegMsgMessage,
  type NegStatusMessage,
} from "../../protocol/negentropy";
import type { ChangeStore } from "../../storage/changes";

export type NegentropySessionManager = ReturnType<
  typeof createNegentropySessionManager
>;

export function createNegentropySessionManager(options: {
  headStore: HeadStore;
  changeStore: ChangeStore;
}) {
  const sessions = new Map<string, NegentropySession>();

  return {
    async open(message: NegOpenMessage): Promise<NegStatusMessage> {
      const scope = parseRevisionScope(message[2]);
      const snapshotSeq = await options.changeStore.currentSequence();
      const heads = await options.headStore.listHeadsAtSnapshot(
        scope,
        snapshotSeq,
      );
      const session = createNegentropySession(
        heads.map((head) => ({
          id: head.revisionId,
          timestamp: head.mtime,
        })),
      );
      sessions.set(message[1], session);
      return createNegStatusMessage(message[1], snapshotSeq);
    },

    async reconcile(message: NegMsgMessage): Promise<NegMsgMessage> {
      const session = sessions.get(message[1]);
      if (!session) {
        throw new Error(`unknown negentropy session: ${message[1]}`);
      }

      const result = await session.reconcile(message[2]);
      if (result.nextMessage === null) {
        return createNegMsgMessage(message[1], "");
      }

      return createNegMsgMessage(message[1], result.nextMessage);
    },

    close(subscriptionId: string) {
      sessions.delete(subscriptionId);
    },
  };
}

function parseRevisionScope(input: Record<string, unknown>): RevisionScope {
  const authorValues = arrayOfStrings(input.authors);
  if (authorValues.length !== 1) {
    throw new Error("NEG-OPEN requires exactly one author for revision sync");
  }

  const documentCoords = arrayOfStrings(input["#d"]);
  const revisionIds = arrayOfStrings(input["#r"]);

  return {
    authorPubkey: authorValues[0],
    documentCoords: documentCoords.length > 0 ? documentCoords : undefined,
    revisionIds: revisionIds.length > 0 ? revisionIds : undefined,
  };
}

function arrayOfStrings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}
