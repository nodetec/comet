export type VisibleVectorClock = Record<string, number>;

export type VectorClockComparison =
  | "equal"
  | "dominates"
  | "dominated"
  | "concurrent";

export function parseVisibleVectorClockFromTags(
  tags: string[][],
): VisibleVectorClock | null {
  const entries = tags.filter(([name]) => name === "vc");
  if (entries.length === 0) {
    return null;
  }

  const vectorClock: VisibleVectorClock = {};
  for (const entry of entries) {
    const [, deviceId, counterText] = entry;
    if (
      typeof deviceId !== "string" ||
      deviceId.trim().length === 0 ||
      typeof counterText !== "string" ||
      !/^\d+$/.test(counterText)
    ) {
      return null;
    }

    const counter = Number(counterText);
    if (!Number.isSafeInteger(counter) || counter < 0) {
      return null;
    }
    if (deviceId in vectorClock) {
      return null;
    }

    vectorClock[deviceId] = counter;
  }

  if (Object.keys(vectorClock).length === 0) {
    return null;
  }

  return canonicalizeVisibleVectorClock(vectorClock);
}

export function canonicalizeVisibleVectorClock(
  input: VisibleVectorClock,
): VisibleVectorClock {
  return Object.fromEntries(
    Object.entries(input).sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function compareVisibleVectorClocks(
  left: VisibleVectorClock,
  right: VisibleVectorClock,
): VectorClockComparison {
  const deviceIds = new Set([...Object.keys(left), ...Object.keys(right)]);

  let leftGreater = false;
  let rightGreater = false;

  for (const deviceId of deviceIds) {
    const leftValue = left[deviceId] ?? 0;
    const rightValue = right[deviceId] ?? 0;

    if (leftValue > rightValue) {
      leftGreater = true;
    } else if (rightValue > leftValue) {
      rightGreater = true;
    }
  }

  if (!leftGreater && !rightGreater) {
    return "equal";
  }
  if (leftGreater && !rightGreater) {
    return "dominates";
  }
  if (!leftGreater && rightGreater) {
    return "dominated";
  }
  return "concurrent";
}

export function selectNondominatedSnapshotIds<
  T extends { snapshotId: string; vectorClock: VisibleVectorClock },
>(rows: T[]): Set<string> {
  const nondominated = new Set<string>();

  for (const row of rows) {
    let dominated = false;
    for (const other of rows) {
      if (row.snapshotId === other.snapshotId) {
        continue;
      }
      const comparison = compareVisibleVectorClocks(
        row.vectorClock,
        other.vectorClock,
      );
      if (comparison === "dominated") {
        dominated = true;
        break;
      }
    }

    if (!dominated) {
      nondominated.add(row.snapshotId);
    }
  }

  return nondominated;
}
