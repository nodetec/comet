export type VisibleVectorClock = Record<string, number>;

export type VectorClockComparison =
  | "equal"
  | "dominates"
  | "dominated"
  | "concurrent";

export const MAX_SAFE_VECTOR_CLOCK_COUNTER = 9_007_199_254_740_991;
export const MAX_VISIBLE_VECTOR_CLOCK_ENTRIES = 32;

function compareDeviceIds(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

export function parseVisibleVectorClockFromTags(
  tags: string[][],
): VisibleVectorClock | null {
  const entries = tags.filter(([name]) => name === "vc");
  if (entries.length === 0) {
    return null;
  }
  if (entries.length > MAX_VISIBLE_VECTOR_CLOCK_ENTRIES) {
    return null;
  }

  const vectorClock: VisibleVectorClock = {};
  let previousDeviceId: string | null = null;
  for (const entry of entries) {
    if (entry.length !== 3) {
      return null;
    }
    const [, deviceId, counterText] = entry;
    if (
      typeof deviceId !== "string" ||
      deviceId.trim().length === 0 ||
      typeof counterText !== "string" ||
      !/^\d+$/.test(counterText)
    ) {
      return null;
    }

    if (
      previousDeviceId !== null &&
      compareDeviceIds(previousDeviceId, deviceId) >= 0
    ) {
      return null;
    }

    const counter = Number(counterText);
    if (
      !Number.isSafeInteger(counter) ||
      counter <= 0 ||
      counter > MAX_SAFE_VECTOR_CLOCK_COUNTER
    ) {
      return null;
    }
    if (deviceId in vectorClock) {
      return null;
    }

    vectorClock[deviceId] = counter;
    previousDeviceId = deviceId;
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
    Object.entries(input).sort(([left], [right]) =>
      compareDeviceIds(left, right),
    ),
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
