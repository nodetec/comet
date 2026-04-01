import { EditorSelection, EditorState } from "@codemirror/state";
import { markdown as markdownLanguage } from "@codemirror/lang-markdown";
import { describe, expect, it } from "vitest";

import {
  getCursorLineRanges,
  getCursorRanges,
  overlapsAny,
} from "@/features/editor/extensions/markdown-decorations/cursor";

function createState(doc: string, cursor?: number) {
  return EditorState.create({
    doc,
    extensions: [markdownLanguage()],
    selection: cursor == null ? undefined : EditorSelection.cursor(cursor),
  });
}

describe("cursor line ranges", () => {
  it("returns the line range for a single cursor", () => {
    const state = createState("line one\nline two\nline three", 10);
    const ranges = getCursorLineRanges(state);

    expect(ranges).toEqual([{ from: 9, to: 17 }]);
  });

  it("returns empty for a state with cursor at start", () => {
    const state = createState("hello", 0);
    const ranges = getCursorLineRanges(state);

    expect(ranges).toEqual([{ from: 0, to: 5 }]);
  });

  it("covers full line range for a range selection spanning lines", () => {
    // Selection from middle of line 1 to middle of line 3
    const state = createState("aaa\nbbb\nccc\nddd", 5);
    const withSelection = state.update({
      selection: EditorSelection.range(1, 9),
    }).state;
    const ranges = getCursorLineRanges(withSelection);

    expect(ranges).toEqual([{ from: 0, to: 11 }]);
  });
});

describe("overlapsAny", () => {
  it("returns true when node overlaps a range", () => {
    const ranges = [{ from: 10, to: 20 }];

    expect(overlapsAny(10, 20, ranges)).toBe(true);
    expect(overlapsAny(5, 15, ranges)).toBe(true);
    expect(overlapsAny(15, 25, ranges)).toBe(true);
  });

  it("returns false when node does not overlap", () => {
    const ranges = [{ from: 10, to: 20 }];

    expect(overlapsAny(0, 9, ranges)).toBe(false);
    expect(overlapsAny(21, 30, ranges)).toBe(false);
  });
});

describe("getCursorRanges", () => {
  it("returns raw selection ranges without line expansion", () => {
    const state = createState("hello **bold** world", 10);
    const ranges = getCursorRanges(state);

    // Cursor at position 10 — should NOT expand to full line
    expect(ranges).toEqual([{ from: 10, to: 10 }]);
  });
});
