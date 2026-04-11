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
      // +1 for the space after task marker. Clamp to line end for empty
      // task items like "- [ ] " at end of document.
      const contentFrom = task ? Math.min(task.to + 1, line.to) : markerTo;

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
// Fast line-local lookup — O(line_width) instead of O(doc_size).
// Used by the normalization filter and input handler which run on
// every transaction but only need the item at the cursor line.
// Returns a partial ListItemInfo (no structural links).
// ---------------------------------------------------------------------------

/**
 * Fast line-local lookup. Walks only the given line's syntax nodes
 * to find a list marker, avoiding a full-document tree walk.
 * Returns null if the line is not a list item.
 */
export function getListItemForLineFast(
  state: EditorState,
  pos: number,
): ListItemInfo | null {
  // If the full model is already cached for this state, use it.
  if (cachedState === state) {
    const line = state.doc.lineAt(pos);
    return cachedByLineFrom.get(line.from) ?? null;
  }

  const tree = syntaxTree(state);
  const line = state.doc.lineAt(pos);

  // Walk only the line's range to find a ListMark.
  let result: ListItemInfo | null = null;

  tree.iterate({
    from: line.from,
    to: line.to,
    enter(nodeRef) {
      if (result) return false;

      if (nodeRef.type.name !== "ListMark") {
        return;
      }

      const listMark = nodeRef.node;
      const markerText = state.sliceDoc(listMark.from, listMark.to);
      const hasTrailingSpace =
        state.sliceDoc(listMark.to, listMark.to + 1) === " ";
      if (!hasTrailingSpace) {
        return false;
      }

      // Verify this marker is on the target line.
      if (state.doc.lineAt(listMark.from).from !== line.from) {
        return false;
      }

      // Compute depth from ancestor list nodes.
      let listDepth = 0;
      for (
        let ancestor = listMark.parent;
        ancestor;
        ancestor = ancestor.parent
      ) {
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
      const markerTo = listMark.to + 1;
      const task = detectTask(state, markerText, markerTo);
      const contentFrom = task ? Math.min(task.to + 1, line.to) : markerTo;

      const markerPrefix = state.sliceDoc(line.from, listMark.from);
      const continuationIndent = BULLET_MARKERS.has(markerText)
        ? BULLET_INDENT
        : ORDERED_INDENT;
      const continuationPrefix = markerPrefix + " ".repeat(continuationIndent);
      const indentStyle = `--cm-md-list-child-indent: calc(${indentLevel} * ${LIST_INDENT_STEP} + ${LIST_CHILD_BLOCK_OFFSET})`;

      // Find the ListItem node for the node reference.
      let listItemNode: SyntaxNode | null = null;
      for (
        let ancestor: SyntaxNode | null = listMark;
        ancestor;
        ancestor = ancestor.parent
      ) {
        if (ancestor.type.name === "ListItem") {
          listItemNode = ancestor;
          break;
        }
      }

      result = {
        node: listItemNode ?? listMark,
        depth: indentLevel,
        parentItem: null,
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
      };
      return false;
    },
  });

  return result;
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

/**
 * Find the ListItemInfo containing `pos` (marker line).
 * Uses the fast line-local lookup — doesn't trigger a full model build.
 * For structural data (parent/siblings/children), use getListItemWithStructure().
 */
export function getListItemForLine(
  state: EditorState,
  pos: number,
): ListItemInfo | null {
  return getListItemForLineFast(state, pos);
}

/**
 * Find the ListItemInfo with full structural links (parent, siblings,
 * children). Triggers a full model build if not already cached.
 * Use for operations that need tree relationships (indent/outdent/backspace).
 */
export function getListItemWithStructure(
  state: EditorState,
  pos: number,
): ListItemInfo | null {
  const line = state.doc.lineAt(pos);
  getListItems(state); // ensure full model is built
  return cachedByLineFrom.get(line.from) ?? null;
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

/**
 * Compute text changes needed to fix misnumbered ordered list markers.
 * Walks all sibling groups and ensures sequential numbering (1., 2., 3., …).
 * Returns null if no renumbering is needed.
 */
export function computeRenumberChanges(
  state: EditorState,
): { from: number; to: number; insert: string }[] | null {
  const items = getListItems(state);
  const changes: { from: number; to: number; insert: string }[] = [];
  const visited = new Set<ListItemInfo>();

  for (const item of items) {
    if (visited.has(item)) continue;
    if (BULLET_MARKERS.has(item.marker)) continue;

    // Find the first sibling in this ordered group.
    let first: ListItemInfo = item;
    while (first.prevSibling && !BULLET_MARKERS.has(first.prevSibling.marker)) {
      first = first.prevSibling;
    }

    // Walk the group and renumber.
    let expected = 1;
    let current: ListItemInfo | null = first;
    while (current && !BULLET_MARKERS.has(current.marker)) {
      visited.add(current);
      const expectedMarker = `${expected}.`;
      if (current.marker !== expectedMarker) {
        changes.push({
          from: current.markerFrom,
          to: current.markerFrom + current.marker.length,
          insert: expectedMarker,
        });
      }
      expected++;
      current = current.nextSibling;
    }
  }

  return changes.length > 0 ? changes : null;
}

/**
 * Text-based renumbering that works on raw document content (no syntax
 * tree needed). Scans lines for ordered list markers at each indent
 * level and ensures sequential numbering. This is used by indent/outdent
 * handlers where the syntax tree may not yet reflect the changes.
 */
// Matches ordered list markers, optionally preceded by blockquote `> ` prefixes.
const ORDERED_MARKER_RE = /^((?:[ \t]{0,3}> ?)*)(\s*)(\d+)(\.\s)/;

export function computeRenumberChangesFromText(doc: {
  line(n: number): { from: number; text: string };
  lines: number;
}): { from: number; to: number; insert: string }[] | null {
  const changes: { from: number; to: number; insert: string }[] = [];
  // Track the expected next number per (quotePrefix + indent) key.
  const counters = new Map<string, number>();

  for (let lineNum = 1; lineNum <= doc.lines; lineNum++) {
    const line = doc.line(lineNum);
    const match = ORDERED_MARKER_RE.exec(line.text);
    if (!match) {
      continue;
    }

    const quotePrefix = match[1];
    const indent = match[2].length;
    const currentNum = match[3];
    // Key by quote prefix + indent to handle blockquote-nested lists
    // as separate numbering groups.
    const key = `${quotePrefix}:${indent}`;

    // Reset counters for deeper indents within the same quote context.
    for (const [k] of counters) {
      if (k.startsWith(`${quotePrefix}:`) && k !== key) {
        const otherIndent = Number(k.split(":")[1]);
        if (otherIndent > indent) {
          counters.delete(k);
        }
      }
    }

    const expected = counters.get(key) ?? 1;
    const expectedStr = String(expected);

    if (currentNum !== expectedStr) {
      const markerStart = line.from + quotePrefix.length + indent;
      changes.push({
        from: markerStart,
        to: markerStart + currentNum.length,
        insert: expectedStr,
      });
    }

    counters.set(key, expected + 1);
  }

  return changes.length > 0 ? changes : null;
}

// Exported for testing.
export { invalidateCache as _invalidateListModelCache };
