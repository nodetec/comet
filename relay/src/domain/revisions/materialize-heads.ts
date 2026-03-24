import type { RevisionHead } from "../../types";

export function applyRevisionToHeads(
  currentHeads: readonly RevisionHead[],
  nextHead: RevisionHead,
  parentRevisionIds: readonly string[],
): RevisionHead[] {
  const remaining = currentHeads.filter(
    (head) =>
      head.revisionId !== nextHead.revisionId &&
      !parentRevisionIds.includes(head.revisionId),
  );

  return [...remaining, nextHead].sort((left, right) =>
    left.revisionId.localeCompare(right.revisionId),
  );
}
