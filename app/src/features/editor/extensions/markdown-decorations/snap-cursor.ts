import { syntaxTree } from "@codemirror/language";
import { EditorSelection, type EditorState } from "@codemirror/state";
import type { SyntaxNode, Tree } from "@lezer/common";

import { isSpaceDelimitedATXHeading } from "@/features/editor/extensions/markdown-decorations/builders/headings";
import {
  getCursorLineRanges,
  getCursorRanges,
  overlapsAny,
} from "@/features/editor/extensions/markdown-decorations/cursor";

const ATX_HEADING_NAMES = new Set([
  "ATXHeading1",
  "ATXHeading2",
  "ATXHeading3",
  "ATXHeading4",
  "ATXHeading5",
  "ATXHeading6",
]);

/**
 * Check whether a cursor position falls inside or at the boundary of
 * hidden syntax (heading prefix, blockquote prefix, inline delimiter,
 * etc.) and return the corrected position outside the syntax.
 *
 * For opening syntax the cursor snaps before the node; for closing
 * syntax it snaps after the node.
 *
 * Returns null when no adjustment is needed.
 */
export function getSnappedCursorPosition(
  state: EditorState,
  pos: number,
  /** Skip the "is syntax already revealed?" check. Used for drag-
   *  selection anchors where the anchor was placed while syntax was
   *  still hidden but the cursor has since moved onto the line. */
  ignoreReveal = false,
): number | null {
  const tree = syntaxTree(state);
  const node = tree.resolveInner(pos, 1);
  const cursorLines = ignoreReveal ? [] : getCursorLineRanges(state);
  const cursorRanges = ignoreReveal ? [] : getCursorRanges(state);

  for (let n: SyntaxNode | null = node; n; n = n.parent) {
    const snap = snapNodeSyntax(state, n, pos, cursorLines, cursorRanges);
    if (snap != null) {
      return snap;
    }
  }

  return snapBlockquotePrefix(state, tree, pos, cursorLines);
}

export function getSnappedPointerSelection(
  state: EditorState,
  selection: EditorSelection,
): EditorSelection | null {
  let changed = false;
  const ranges = ("ranges" in selection ? selection.ranges : [selection]).map(
    (range) => {
      const isDrag = range.anchor !== range.head;
      const anchor =
        getSnappedCursorPosition(state, range.anchor, isDrag) ?? range.anchor;
      const head = getSnappedCursorPosition(state, range.head) ?? range.head;

      if (anchor !== range.anchor || head !== range.head) {
        changed = true;
      }

      if (anchor === head) {
        return EditorSelection.cursor(anchor);
      }

      return EditorSelection.range(anchor, head);
    },
  );

  const mainIndex = "mainIndex" in selection ? selection.mainIndex : 0;
  return changed ? EditorSelection.create(ranges, mainIndex) : null;
}

function snapNodeSyntax(
  state: EditorState,
  node: SyntaxNode,
  pos: number,
  cursorLines: ReturnType<typeof getCursorLineRanges>,
  cursorRanges: ReturnType<typeof getCursorRanges>,
): number | null {
  if (ATX_HEADING_NAMES.has(node.name)) {
    return snapHeadingSyntax(state, node, pos, cursorLines);
  }

  if (node.name === "Link") {
    return snapLinkSyntax(node, pos, cursorRanges);
  }

  if (node.name === "WikiLink") {
    return snapWikiLinkSyntax(node, pos, cursorRanges);
  }

  const markName = getInlineMarkName(node.name);
  return markName
    ? snapInlineDelimiters(
        pos,
        node.getChildren(markName),
        node.from,
        node.to,
        cursorRanges,
      )
    : null;
}

function getInlineMarkName(nodeName: string): string | null {
  switch (nodeName) {
    case "Emphasis":
    case "StrongEmphasis": {
      return "EmphasisMark";
    }
    case "InlineCode": {
      return "CodeMark";
    }
    case "Highlight": {
      return "HighlightMark";
    }
    case "Strikethrough": {
      return "StrikethroughMark";
    }
    default: {
      return null;
    }
  }
}

function snapHeadingSyntax(
  state: EditorState,
  heading: SyntaxNode,
  pos: number,
  cursorLines: ReturnType<typeof getCursorLineRanges>,
): number | null {
  if (overlapsAny(heading.from, heading.to, cursorLines)) {
    return null;
  }

  const marks = heading.getChildren("HeaderMark");
  if (marks.length === 0) return null;

  const firstMark = marks[0]!;
  if (!isSpaceDelimitedATXHeading(state, firstMark.to, heading.to)) {
    return null;
  }

  // Opening prefix (## ): inclusive of content-start boundary because
  // posAtCoords maps the visual left edge to contentStart when the
  // prefix is hidden.
  const contentStart = firstMark.to + 1;
  if (pos <= contentStart) {
    return heading.from;
  }

  // Trailing closing mark (## Header ##)
  if (marks.length > 1) {
    // eslint-disable-next-line unicorn/prefer-at
    const lastMark = marks[marks.length - 1]!;
    if (pos >= lastMark.from) {
      return heading.to;
    }
  }

  return null;
}

/**
 * Inside or at boundary of opening delimiter → snap before the node.
 * Inside closing delimiter → snap after the node.
 */
function snapInlineDelimiters(
  pos: number,
  marks: SyntaxNode[],
  nodeFrom: number,
  nodeTo: number,
  cursorRanges: ReturnType<typeof getCursorRanges>,
): number | null {
  if (overlapsAny(nodeFrom, nodeTo, cursorRanges)) {
    return null;
  }

  if (marks.length < 2) return null;

  const openMark = marks[0]!;
  // eslint-disable-next-line unicorn/prefer-at
  const closeMark = marks[marks.length - 1]!;

  // Inclusive of content-start (openMark.to) for the same reason as
  // headings: posAtCoords maps the visual left edge there.
  if (pos <= openMark.to) {
    return nodeFrom;
  }

  if (pos >= closeMark.from) {
    return nodeTo;
  }

  return null;
}

function snapLinkSyntax(
  link: SyntaxNode,
  pos: number,
  cursorRanges: ReturnType<typeof getCursorRanges>,
): number | null {
  if (overlapsAny(link.from, link.to, cursorRanges)) {
    return null;
  }

  const marks = link.getChildren("LinkMark");
  if (marks.length < 2) return null;

  const openBracket = marks[0]!;
  const closeBracket = marks[1]!;

  if (pos <= openBracket.to) {
    return link.from;
  }

  if (pos >= closeBracket.from) {
    return link.to;
  }

  return null;
}

function snapWikiLinkSyntax(
  wikilink: SyntaxNode,
  pos: number,
  cursorRanges: ReturnType<typeof getCursorRanges>,
): number | null {
  if (overlapsAny(wikilink.from, wikilink.to, cursorRanges)) {
    return null;
  }

  const openEnd = wikilink.from + 2;
  const closeStart = wikilink.to - 2;
  if (pos <= openEnd) {
    return wikilink.from;
  }

  if (pos >= closeStart && pos < wikilink.to) {
    return wikilink.to;
  }

  return null;
}

function snapBlockquotePrefix(
  state: EditorState,
  tree: Tree,
  pos: number,
  cursorLines: ReturnType<typeof getCursorLineRanges>,
): number | null {
  const line = state.doc.lineAt(pos);
  if (overlapsAny(line.from, line.to, cursorLines)) {
    return null;
  }

  let inPrefix = false;

  tree.iterate({
    from: line.from,
    to: line.to,
    enter(child) {
      if (child.name !== "QuoteMark") return;

      const afterMark = child.to;
      const endOfPrefix =
        afterMark < line.to && line.text[afterMark - line.from] === " "
          ? afterMark + 1
          : afterMark;

      if (pos >= child.from && pos <= endOfPrefix) {
        inPrefix = true;
      }
    },
  });

  return inPrefix ? line.from : null;
}
