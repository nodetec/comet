// @vitest-environment jsdom

import { EditorSelection, EditorState, Transaction } from "@codemirror/state";
import { markdown as markdownLanguage } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import { getInlineSyntaxRightBoundaryAtCursor } from "@/features/editor/extensions/markdown-decorations/builders/inline-boundaries";
import { isSpaceDelimitedATXHeading } from "@/features/editor/extensions/markdown-decorations/builders/headings";
import {
  getCursorLineRanges,
  getCursorRanges,
  overlapsAny,
} from "@/features/editor/extensions/markdown-decorations/cursor";
import { markdownDecorations } from "@/features/editor/extensions/markdown-decorations/index";
import {
  getSnappedCursorPosition,
  getSnappedPointerSelection,
} from "@/features/editor/extensions/markdown-decorations/snap-cursor";

function createState(doc: string, cursor?: number) {
  return EditorState.create({
    doc,
    extensions: [markdownLanguage()],
    selection: cursor == null ? undefined : EditorSelection.cursor(cursor),
  });
}

function createDecoratedView(doc: string, selection: EditorSelection) {
  const parent = document.createElement("div");
  document.body.append(parent);

  return new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [markdownLanguage(), markdownDecorations()],
      selection,
    }),
  });
}

afterEach(() => {
  document.body.replaceChildren();
});

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

  it("returns line ranges covering a non-empty range selection", () => {
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

describe("ATX heading delimiter rules", () => {
  it("requires a space after the header marks", () => {
    const bareHash = createState("#", 0);
    const hashWithSpace = createState("# ", 0);
    const hashWithText = createState("# heading", 0);

    expect(isSpaceDelimitedATXHeading(bareHash, 1, 1)).toBe(false);
    expect(isSpaceDelimitedATXHeading(hashWithSpace, 1, 2)).toBe(true);
    expect(isSpaceDelimitedATXHeading(hashWithText, 1, 9)).toBe(true);
  });
});

describe("getInlineSyntaxRightBoundaryAtCursor", () => {
  it("snaps bold/emphasis clicks from content end to syntax end", () => {
    const state = createState("**test**");
    expect(getInlineSyntaxRightBoundaryAtCursor(state, 6)).toEqual({
      contentEnd: 6,
      syntaxEnd: 8,
    });
  });

  it("does not snap clicks inside visible content", () => {
    const state = createState("**test**");
    expect(getInlineSyntaxRightBoundaryAtCursor(state, 4)).toBeNull();
  });
});

describe("getSnappedCursorPosition", () => {
  it("snaps hidden heading prefix clicks to the heading start", () => {
    const state = createState("# Heading\nBody", 11);

    expect(getSnappedCursorPosition(state, 2)).toBe(0);
  });

  it("snaps hidden blockquote prefix clicks to the line start", () => {
    const state = createState("> Quote\nBody", 8);

    expect(getSnappedCursorPosition(state, 2)).toBe(0);
  });

  it("does not snap when the heading line is already revealed", () => {
    const state = createState("# Heading", 4);

    expect(getSnappedCursorPosition(state, 2)).toBeNull();
  });
});

describe("getSnappedPointerSelection", () => {
  it("collapses accidental heading prefix selections", () => {
    const state = createState("# Heading\nBody", 11);
    const selection = getSnappedPointerSelection(
      state,
      EditorSelection.create([EditorSelection.range(0, 2)]),
    );

    expect(selection?.main.empty).toBe(true);
    expect(selection?.main.head).toBe(0);
  });
});

describe("markdownDecorations pointer selection normalization", () => {
  it("snaps pointer clicks on hidden heading prefixes before reveal", () => {
    const view = createDecoratedView(
      "# Heading\nBody",
      EditorSelection.create([
        EditorSelection.cursor("# Heading\n".length + 1),
      ]),
    );

    view.dispatch({
      annotations: Transaction.userEvent.of("select.pointer"),
      selection: EditorSelection.cursor(2),
    });

    expect(view.state.selection.main.head).toBe(0);
    view.destroy();
  });

  it("keeps pointer clicks on already revealed heading content unchanged", () => {
    const view = createDecoratedView(
      "# Heading",
      EditorSelection.create([EditorSelection.cursor(4)]),
    );

    view.dispatch({
      annotations: Transaction.userEvent.of("select.pointer"),
      selection: EditorSelection.cursor(2),
    });

    expect(view.state.selection.main.head).toBe(2);
    view.destroy();
  });
});
