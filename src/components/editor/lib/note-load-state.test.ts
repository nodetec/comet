import { describe, expect, it } from "vitest";

import {
  createLoadScopedRequestGate,
  createMarkdownChangeTracker,
} from "./note-load-state";

describe("note load state", () => {
  it("resets the markdown baseline across note loads", () => {
    const tracker = createMarkdownChangeTracker();

    tracker.setBaseline("# First");
    expect(tracker.consume("# First")).toBeNull();
    expect(tracker.consume("# First updated")).toBe("# First updated");

    tracker.resetForLoad();
    expect(tracker.consume("# First updated")).toBeNull();

    tracker.setBaseline("# Second");
    expect(tracker.consume("# Second")).toBeNull();
    expect(tracker.consume("# Second updated")).toBe("# Second updated");
  });

  it("invalidates stale async requests when the load changes", () => {
    const gate = createLoadScopedRequestGate();

    const firstRequest = gate.issue();
    expect(gate.isCurrent(firstRequest)).toBe(true);

    gate.invalidate();
    expect(gate.isCurrent(firstRequest)).toBe(false);

    const secondRequest = gate.issue();
    expect(gate.isCurrent(secondRequest)).toBe(true);
    expect(gate.isCurrent(firstRequest)).toBe(false);
  });
});
