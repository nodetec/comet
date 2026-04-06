import type { EditorState } from "@codemirror/state";

import type { LineRange } from "@/features/editor/extensions/markdown-decorations/types";

/**
 * Returns merged line ranges covering all selections.
 * For carets, returns the head line. For range selections, returns
 * lines spanned by the selection. Used by headings.
 */
export function getCursorLineRanges(state: EditorState): LineRange[] {
  const ranges: LineRange[] = [];

  for (const range of state.selection.ranges) {
    const fromLine = state.doc.lineAt(range.empty ? range.head : range.from);
    const toLine = range.empty ? fromLine : state.doc.lineAt(range.to);
    const lineRange: LineRange = {
      from: fromLine.from,
      to: toLine.to,
    };

    // eslint-disable-next-line unicorn/prefer-at
    const last = ranges.length > 0 ? ranges[ranges.length - 1] : undefined;
    if (last && lineRange.from <= last.to) {
      last.to = Math.max(last.to, lineRange.to);
    } else {
      ranges.push(lineRange);
    }
  }

  return ranges;
}

/**
 * Returns selection ranges (point for carets, span for range selections).
 * Used by inline elements (bold, italic, code, links, strikethrough) which
 * reveal syntax when the selection overlaps the element.
 */
export function getCursorRanges(state: EditorState): LineRange[] {
  return state.selection.ranges.map((range) =>
    range.empty
      ? { from: range.head, to: range.head }
      : { from: range.from, to: range.to },
  );
}

/** Check whether a node overlaps any of the given ranges. */
export function overlapsAny(
  from: number,
  to: number,
  ranges: LineRange[],
): boolean {
  for (const range of ranges) {
    if (from <= range.to && to >= range.from) {
      return true;
    }
  }
  return false;
}
