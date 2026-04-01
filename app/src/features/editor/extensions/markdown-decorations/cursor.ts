import type { EditorState } from "@codemirror/state";

import type { LineRange } from "@/features/editor/extensions/markdown-decorations/types";

/**
 * Returns merged line ranges for all selection cursors/ranges.
 * Used by headings which reveal on cursor-line (the `# ` prefix is at the
 * start of the line so element-level reveal would feel wrong).
 */
export function getCursorLineRanges(state: EditorState): LineRange[] {
  const ranges: LineRange[] = [];

  for (const range of state.selection.ranges) {
    const fromLine = state.doc.lineAt(range.from);
    const toLine = state.doc.lineAt(range.to);
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
 * Returns raw cursor/selection ranges (not expanded to lines).
 * Used by inline elements (bold, italic, code, links, strikethrough) which
 * should only reveal syntax when the caret is inside the element.
 */
export function getCursorRanges(state: EditorState): LineRange[] {
  return state.selection.ranges.map((r) => ({ from: r.from, to: r.to }));
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
