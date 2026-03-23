import { describe, expect, it } from "vitest";

import { parseSingleChecklistItemContent } from "./checklist-paste";

describe("parseSingleChecklistItemContent", () => {
  it("extracts checklist content from a single checklist line", () => {
    expect(parseSingleChecklistItemContent("- [ ] follow up")).toBe(
      "follow up",
    );
    expect(parseSingleChecklistItemContent("- [x] done")).toBe("done");
    expect(parseSingleChecklistItemContent("* [X] uppercase")).toBe(
      "uppercase",
    );
  });

  it("returns an empty string for a bare checklist marker", () => {
    expect(parseSingleChecklistItemContent("- [ ]")).toBe("");
  });

  it("ignores multi-line or non-checklist markdown", () => {
    expect(parseSingleChecklistItemContent("- [ ] first\n- [ ] second")).toBe(
      null,
    );
    expect(parseSingleChecklistItemContent("plain text")).toBe(null);
    expect(parseSingleChecklistItemContent("## heading")).toBe(null);
  });
});
