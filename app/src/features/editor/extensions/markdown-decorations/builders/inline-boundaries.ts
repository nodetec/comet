import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";

const INLINE_BOUNDARY_NODE_NAMES = new Set([
  "Emphasis",
  "Highlight",
  "InlineCode",
  "StrongEmphasis",
  "Strikethrough",
]);

function getInlineContentEnd(node: SyntaxNode): number | null {
  if (node.name === "Emphasis" || node.name === "StrongEmphasis") {
    const marks = node.getChildren("EmphasisMark");
    // eslint-disable-next-line unicorn/prefer-at
    return marks.length > 1 ? marks[marks.length - 1]!.from : null;
  }

  if (node.name === "InlineCode") {
    const marks = node.getChildren("CodeMark");
    // eslint-disable-next-line unicorn/prefer-at
    return marks.length > 1 ? marks[marks.length - 1]!.from : null;
  }

  if (node.name === "Highlight") {
    const marks = node.getChildren("HighlightMark");
    // eslint-disable-next-line unicorn/prefer-at
    return marks.length > 1 ? marks[marks.length - 1]!.from : null;
  }

  if (node.name === "Strikethrough") {
    const marks = node.getChildren("StrikethroughMark");
    // eslint-disable-next-line unicorn/prefer-at
    return marks.length > 1 ? marks[marks.length - 1]!.from : null;
  }

  return null;
}

export function getInlineSyntaxRightBoundaryAtCursor(
  state: EditorState,
  position: number,
): { contentEnd: number; syntaxEnd: number } | null {
  const node = syntaxTree(state).resolveInner(position, 1);

  for (
    let current: SyntaxNode | null = node;
    current;
    current = current.parent
  ) {
    if (!INLINE_BOUNDARY_NODE_NAMES.has(current.name)) {
      continue;
    }

    const contentEnd = getInlineContentEnd(current);
    if (contentEnd == null) {
      continue;
    }

    if (position === contentEnd && current.to > position) {
      return {
        contentEnd,
        syntaxEnd: current.to,
      };
    }
  }

  return null;
}
