import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";

import {
  BLOCKQUOTE_PREFIX_RE,
  BULLET_INDENT,
  BULLET_MARKERS,
  LIST_CHILD_BLOCK_OFFSET,
  LIST_INDENT_STEP,
  ORDERED_INDENT,
  TASK_MARKERS,
} from "@/features/editor/extensions/lists/list-types";

// ---------------------------------------------------------------------------
// ListItemInfo — read-only projection from the lezer syntax tree
// ---------------------------------------------------------------------------

export type ListItemInfo = {
  /** The ListItem syntax node. */
  node: SyntaxNode;

  // -- Structure ------------------------------------------------------------

  /** Nesting depth (0 for top-level items). */
  depth: number;
  /** Parent list item (null for top-level). */
  parentItem: ListItemInfo | null;
  /** Direct child list items. */
  children: ListItemInfo[];
  /** Previous sibling at the same nesting level. */
  prevSibling: ListItemInfo | null;
  /** Next sibling at the same nesting level. */
  nextSibling: ListItemInfo | null;

  // -- Line position --------------------------------------------------------

  /** Absolute position of the marker line start. */
  lineFrom: number;
  /** Absolute position of the marker line end. */
  lineTo: number;

  // -- Marker ---------------------------------------------------------------

  /** The raw marker text: "-", "*", "+", "1.", etc. */
  marker: string;
  /** Absolute position of the marker start. */
  markerFrom: number;
  /** Absolute position after marker + trailing space. */
  markerTo: number;
  /** First content character (after marker + optional task marker). */
  contentFrom: number;
  /** Leading whitespace count before the marker (minus blockquote prefix). */
  sourceIndentChars: number;

  // -- Task -----------------------------------------------------------------

  /** Task checkbox info, or null if not a task item. */
  task: { from: number; to: number; checked: boolean } | null;

  // -- Derived (pre-computed) -----------------------------------------------

  /** CSS indent level for `--indent-level`. */
  indentLevel: number;
  /** CSS style string for child/continuation line indent. */
  indentStyle: string;
  /** Expected whitespace prefix for continuation lines of this item. */
  continuationPrefix: string;
};

// ---------------------------------------------------------------------------
// Cache — keyed by EditorState identity (same pattern as the old
// cachedMarkerRanges). Invalidated when state object changes.
// ---------------------------------------------------------------------------

let cachedState: EditorState | null = null;
let cachedItems: ListItemInfo[] = [];
let cachedByLineFrom = new Map<number, ListItemInfo>();

function invalidateCache() {
  cachedState = null;
  cachedItems = [];
  cachedByLineFrom = new Map();
}

// ---------------------------------------------------------------------------
// Builder — single tree walk produces the full model
// ---------------------------------------------------------------------------

function buildListItems(state: EditorState): ListItemInfo[] {
  const tree = syntaxTree(state);
  const items: ListItemInfo[] = [];

  // Pass 1: collect all ListItem nodes with their marker data.
  tree.iterate({
    enter(nodeRef) {
      if (nodeRef.type.name !== "ListItem") {
        return;
      }

      const node = nodeRef.node;
      const listMark = findListMark(node);
      if (!listMark) {
        return false; // skip subtree
      }

      const markerText = state.sliceDoc(listMark.from, listMark.to);
      const hasTrailingSpace =
        state.sliceDoc(listMark.to, listMark.to + 1) === " ";
      if (!hasTrailingSpace) {
        return false;
      }

      const line = state.doc.lineAt(listMark.from);

      // Compute depth from ancestor list nodes.
      let listDepth = 0;
      for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
        if (
          ancestor.type.name === "BulletList" ||
          ancestor.type.name === "OrderedList"
        ) {
          listDepth += 1;
        }
      }
      const indentLevel = Math.max(0, listDepth - 1);

      const quotePrefix = BLOCKQUOTE_PREFIX_RE.exec(line.text)?.[0] ?? "";
      const sourceIndentChars = Math.max(
        0,
        listMark.from - line.from - quotePrefix.length,
      );

      // Marker range: position after marker + space.
      const markerTo = listMark.to + 1; // include trailing space

      // Task detection.
      const task = detectTask(state, markerText, markerTo);
      const contentFrom = task ? task.to + 1 : markerTo; // +1 for space after task

      // Continuation prefix.
      const markerPrefix = state.sliceDoc(line.from, listMark.from);
      const continuationIndent = BULLET_MARKERS.has(markerText)
        ? BULLET_INDENT
        : ORDERED_INDENT;
      const continuationPrefix = markerPrefix + " ".repeat(continuationIndent);

      // Indent style for child blocks. Must match the marker line's text
      // start: indentLevel * step + marker width (the textIndent pulls
      // the marker left, so text starts at paddingLeft).
      const indentStyle = `--cm-md-list-child-indent: calc(${indentLevel} * ${LIST_INDENT_STEP} + ${LIST_CHILD_BLOCK_OFFSET})`;

      items.push({
        node,
        depth: indentLevel,
        parentItem: null, // linked in pass 2
        children: [],
        prevSibling: null,
        nextSibling: null,
        lineFrom: line.from,
        lineTo: line.to,
        marker: markerText,
        markerFrom: listMark.from,
        markerTo,
        contentFrom,
        sourceIndentChars,
        task,
        indentLevel,
        indentStyle,
        continuationPrefix,
      });

      // Don't descend into children — we'll encounter nested ListItems
      // via the tree iteration naturally.
    },
  });

  // Pass 2: link parent/child/sibling relationships.
  linkRelationships(items);

  return items;
}

function findListMark(listItem: SyntaxNode): SyntaxNode | null {
  for (let child = listItem.firstChild; child; child = child.nextSibling) {
    if (child.type.name === "ListMark") {
      return child;
    }
  }
  return null;
}

function detectTask(
  state: EditorState,
  marker: string,
  markerTo: number,
): { from: number; to: number; checked: boolean } | null {
  if (!BULLET_MARKERS.has(marker)) {
    return null;
  }

  const taskFrom = markerTo;
  const taskTo = taskFrom + 3;
  if (taskTo > state.doc.length) {
    return null;
  }

  const taskText = state.sliceDoc(taskFrom, taskTo);
  if (!TASK_MARKERS.has(taskText)) {
    return null;
  }

  const hasTrailingSpace = state.sliceDoc(taskTo, taskTo + 1) === " ";
  if (!hasTrailingSpace) {
    return null;
  }

  return { from: taskFrom, to: taskTo, checked: taskText === "[x]" };
}

function linkSiblings(children: ListItemInfo[]) {
  for (let i = 0; i < children.length; i++) {
    if (i > 0) {
      children[i].prevSibling = children[i - 1];
    }
    if (i < children.length - 1) {
      children[i].nextSibling = children[i + 1];
    }
  }
}

function linkRelationships(items: ListItemInfo[]) {
  // Build a map from ListItem node ID to ListItemInfo for fast lookup.
  const byNodeId = new Map<number, ListItemInfo>();
  for (const item of items) {
    byNodeId.set(item.node.from, item);
  }

  for (const item of items) {
    // Find parent: walk up from the ListItem's parent to find an
    // enclosing ListItem that's also in our items array.
    for (
      let ancestor = item.node.parent;
      ancestor;
      ancestor = ancestor.parent
    ) {
      if (ancestor.type.name === "ListItem") {
        const parentInfo = byNodeId.get(ancestor.from);
        if (parentInfo) {
          item.parentItem = parentInfo;
          parentInfo.children.push(item);
          break;
        }
      }
    }
  }

  // Top-level items (no parent).
  const topLevel = items.filter((item) => item.parentItem === null);
  linkSiblings(topLevel);

  // Children of each parent.
  for (const item of items) {
    if (item.children.length > 0) {
      linkSiblings(item.children);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API — cached lookups
// ---------------------------------------------------------------------------

/** Get all ListItemInfo objects for the document. Cached per EditorState. */
export function getListItems(state: EditorState): ListItemInfo[] {
  if (cachedState === state) {
    return cachedItems;
  }

  const items = buildListItems(state);
  cachedState = state;
  cachedItems = items;
  cachedByLineFrom = new Map();
  for (const item of items) {
    cachedByLineFrom.set(item.lineFrom, item);
  }

  return items;
}

/** Find the ListItemInfo whose marker is on the line starting at `lineFrom`. */
export function getListItemAtLine(
  state: EditorState,
  lineFrom: number,
): ListItemInfo | null {
  getListItems(state); // ensure cache is populated
  return cachedByLineFrom.get(lineFrom) ?? null;
}

/** Find the ListItemInfo containing `pos` (marker line). */
export function getListItemForLine(
  state: EditorState,
  pos: number,
): ListItemInfo | null {
  const line = state.doc.lineAt(pos);
  return getListItemAtLine(state, line.from);
}

/**
 * Find the ListItemInfo whose marker range contains `pos`.
 * Used for click handling and cursor normalization.
 */
export function getListItemAtPosition(
  state: EditorState,
  pos: number,
): ListItemInfo | null {
  for (const item of getListItems(state)) {
    if (pos >= item.markerFrom && pos <= item.contentFrom) {
      return item;
    }
  }
  return null;
}

// Exported for testing.
export { invalidateCache as _invalidateListModelCache };
