import { indentLess, indentMore } from "@codemirror/commands";
import { syntaxTree } from "@codemirror/language";
import {
  EditorSelection,
  EditorState,
  Prec,
  Transaction,
  type Extension,
  type Range,
  type TransactionSpec,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  keymap,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import type { SyntaxNode, SyntaxNodeRef } from "@lezer/common";

import {
  isListDecorationsDisabled,
  isListInteractionsDisabled,
  isListSelectionNormalizationDisabled,
  logEditorDebug,
} from "@/shared/lib/editor-debug";
import {
  BLOCKQUOTE_PREFIX_RE,
  BULLET_INDENT,
  BULLET_MARKERS,
  LIST_PREFIX_RE,
  ORDERED_INDENT,
  TASK_MARKERS,
  type DocLine,
  type ExplicitContinuationContext,
  type HiddenPrefixRange,
  type MarkerRange,
  type TaskListShortcut,
} from "@/features/editor/extensions/lists/list-types";
import {
  EmptyTaskPlaceholderWidget,
  TaskMarkerWidget,
} from "@/features/editor/extensions/lists/list-widgets";
import { listTheme } from "@/features/editor/extensions/lists/list-theme";
import {
  getListItemForLine,
  getListItems,
  type ListItemInfo,
} from "@/features/editor/extensions/lists/list-model";

function addListDecorations(
  item: ListItemInfo,
  lineClass: string,
  markerDecoration: Range<Decoration>,
  decorationRanges: Range<Decoration>[],
  _atomicRanges: Range<Decoration>[],
) {
  decorationRanges.push(
    Decoration.line({
      attributes: {
        class: lineClass,
        style: `--indent-level: ${item.indentLevel}`,
      },
    }).range(item.lineFrom),
    markerDecoration,
  );
}

function addListChildLineDecorations(
  state: EditorState,
  from: number,
  to: number,
  markerLineStart: number,
  indentStyle: string,
  decorationRanges: Range<Decoration>[],
) {
  let line = state.doc.lineAt(from);

  while (true) {
    if (line.from !== markerLineStart) {
      decorationRanges.push(
        Decoration.line({
          attributes: {
            class: "cm-md-list-child",
            style: indentStyle,
          },
        }).range(line.from),
      );
    }

    if (line.to >= to || line.to + 1 > state.doc.length) {
      break;
    }

    line = state.doc.lineAt(line.to + 1);
  }
}

function addParagraphChildLineDecorations(
  state: EditorState,
  child: SyntaxNodeRef["node"],
  markerLineStart: number,
  expectedPrefix: string,
  indentStyle: string,
  decorationRanges: Range<Decoration>[],
) {
  let line = state.doc.lineAt(child.from);

  while (true) {
    if (line.from !== markerLineStart && line.text.startsWith(expectedPrefix)) {
      decorationRanges.push(
        Decoration.line({
          attributes: {
            class: "cm-md-list-child",
            style: indentStyle,
          },
        }).range(line.from),
      );
    }

    if (line.to >= child.to || line.to + 1 > state.doc.length) {
      break;
    }

    line = state.doc.lineAt(line.to + 1);
  }
}

function getListTextStart(lineText: string, lineFrom: number, lineTo: number) {
  const match = LIST_PREFIX_RE.exec(lineText);
  return Math.min(lineTo, lineFrom + (match?.[0].length ?? 0));
}

function summarizeTransactionChanges(transaction: Transaction) {
  const changes: { fromA: number; toA: number; insert: string }[] = [];
  transaction.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    changes.push({
      fromA,
      insert: inserted.toString(),
      toA,
    });
  });
  return changes;
}

function logListDeleteDebug(
  message: string,
  payload?: Record<string, unknown>,
) {
  logEditorDebug("lists", message, payload);
}

function getParsedContinuationContextForLine(
  state: EditorState,
  targetLineFrom: number,
): ExplicitContinuationContext | null {
  // Walk up from the target position to find an enclosing ListItem.
  const tree = syntaxTree(state);
  let listItemNode: SyntaxNode | null = null;
  for (
    let n: SyntaxNode | null = tree.resolveInner(targetLineFrom, 1);
    n;
    n = n.parent
  ) {
    if (n.type.name === "ListItem") {
      listItemNode = n;
      break;
    }
  }

  if (!listItemNode) {
    return null;
  }

  // Look up the model for this ListItem's marker line.
  const markerLine = state.doc.lineAt(listItemNode.from);
  const item = getListItemForLine(state, markerLine.from);
  if (!item) {
    return null;
  }

  const line = state.doc.lineAt(targetLineFrom);
  if (line.from !== targetLineFrom || line.from === item.lineFrom) {
    return null;
  }

  if (!line.text.startsWith(item.continuationPrefix)) {
    return null;
  }

  // Verify the target line is inside a Paragraph child of this ListItem.
  for (let child = listItemNode.firstChild; child; child = child.nextSibling) {
    if (
      child.type.name === "Paragraph" &&
      targetLineFrom >= child.from &&
      targetLineFrom <= child.to
    ) {
      return {
        indentStyle: item.indentStyle,
        prefix: item.continuationPrefix,
      };
    }
  }

  return null;
}

function getExplicitContinuationContextForLine(
  state: EditorState,
  line: DocLine,
): ExplicitContinuationContext | null {
  const parsedContext = getParsedContinuationContextForLine(state, line.from);
  if (parsedContext) {
    return parsedContext;
  }

  if (line.number === 1) {
    return null;
  }

  const previousLine = state.doc.line(line.number - 1);
  const previousContext =
    getParsedContinuationContextForLine(state, previousLine.from) ??
    (() => {
      const item = getListItemForLine(state, previousLine.from);
      return item
        ? {
            indentStyle: item.indentStyle,
            prefix: item.continuationPrefix,
          }
        : null;
    })();

  if (!previousContext || line.text !== previousContext.prefix) {
    return null;
  }

  return previousContext;
}

export function insertExplicitListContinuationBlock(view: EditorView) {
  const selection = view.state.selection.main;
  if (!selection.empty) {
    return false;
  }

  const line = view.state.doc.lineAt(selection.head);
  if (selection.head !== line.to) {
    return false;
  }

  const item = getListItemForLine(view.state, selection.head);
  if (!item) {
    return false;
  }

  const insert = `\n${item.continuationPrefix}`;
  const cursor = selection.head + insert.length;

  view.dispatch({
    changes: {
      from: selection.head,
      insert,
      to: selection.head,
    },
    selection: EditorSelection.cursor(cursor),
  });

  return true;
}

export function insertExplicitContinuationAfterContinuationLine(
  view: EditorView,
) {
  const selection = view.state.selection.main;
  if (!selection.empty) {
    return false;
  }

  const line = view.state.doc.lineAt(selection.head);
  if (selection.head !== line.to) {
    return false;
  }

  const continuationContext = getExplicitContinuationContextForLine(
    view.state,
    line,
  );
  if (!continuationContext) {
    return false;
  }

  const insert = `\n${continuationContext.prefix}`;
  const cursor = selection.head + insert.length;

  view.dispatch({
    changes: {
      from: selection.head,
      insert,
      to: selection.head,
    },
    selection: EditorSelection.cursor(cursor),
  });

  return true;
}

export function getTaskListShortcut(
  state: EditorState,
  from: number,
  to: number,
  text: string,
): TaskListShortcut | null {
  if (text !== " " || from !== to) {
    return null;
  }

  const line = state.doc.lineAt(from);
  const beforeCursor = state.sliceDoc(line.from, from);
  const match = /^([ \t]*)\[\]$/.exec(beforeCursor);
  if (!match) {
    return null;
  }

  const indent = match[1] ?? "";
  const markerFrom = line.from + indent.length;
  const insert = "- [ ] ";

  return {
    changes: {
      from: markerFrom,
      to: from,
      insert,
    },
    selection: EditorSelection.single(markerFrom + insert.length),
  };
}

function getTaskCheckboxInsertion(state: EditorState): TaskListShortcut | null {
  const selection = state.selection.main;
  if (!selection.empty) {
    return null;
  }

  const line = state.doc.lineAt(selection.head);
  const quotePrefix = BLOCKQUOTE_PREFIX_RE.exec(line.text)?.[0] ?? "";
  const lineContent = line.text.slice(quotePrefix.length);
  const lineContentStart = line.from + quotePrefix.length;
  const listMatch = LIST_PREFIX_RE.exec(lineContent);

  if (listMatch) {
    const existingTaskMarker = listMatch[3]?.trimEnd();
    if (existingTaskMarker && TASK_MARKERS.has(existingTaskMarker)) {
      return null;
    }

    const insert = "[ ] ";
    const insertPosition = lineContentStart + listMatch[0].length;
    const nextHead =
      selection.head <= insertPosition
        ? insertPosition + insert.length
        : selection.head + insert.length;

    return {
      changes: {
        from: insertPosition,
        to: insertPosition,
        insert,
      },
      selection: EditorSelection.single(nextHead),
    };
  }

  const indent = /^([ \t]*)/.exec(lineContent)?.[1] ?? "";
  const insert = "- [ ] ";
  const insertPosition = lineContentStart + indent.length;
  const nextHead =
    selection.head <= insertPosition
      ? insertPosition + insert.length
      : selection.head + insert.length;

  return {
    changes: {
      from: insertPosition,
      to: insertPosition,
      insert,
    },
    selection: EditorSelection.single(nextHead),
  };
}

export function insertTaskCheckbox(view: EditorView) {
  const insertion = getTaskCheckboxInsertion(view.state);
  if (!insertion) {
    return false;
  }

  view.dispatch(insertion);
  return true;
}

function getListIndentStep(lineText: string): number {
  const match = LIST_PREFIX_RE.exec(lineText);
  if (!match) {
    return BULLET_INDENT;
  }
  const marker = match[2] ?? "";
  return BULLET_MARKERS.has(marker) ? BULLET_INDENT : ORDERED_INDENT;
}

/**
 * Collect all document positions belonging to a list item and its
 * descendants. Returns an array of {from, to} line ranges covering
 * the item's own lines plus every nested child, grandchild, etc.
 */
function collectItemLineRanges(
  state: EditorState,
  item: ListItemInfo,
): { from: number; to: number }[] {
  const ranges: { from: number; to: number }[] = [];
  // The ListItem node spans from the marker to the end of all children.
  const startLine = state.doc.lineAt(item.node.from);
  const endLine = state.doc.lineAt(item.node.to);
  for (
    let lineNum = startLine.number;
    lineNum <= endLine.number;
    lineNum += 1
  ) {
    const line = state.doc.line(lineNum);
    ranges.push({ from: line.from, to: line.to });
  }
  return ranges;
}

function indentListItem(view: EditorView) {
  const selection = view.state.selection.main;
  if (!selection.empty) {
    return indentMore(view);
  }

  const item = getListItemForLine(view.state, selection.head);
  if (!item) {
    return indentMore(view);
  }

  // Can only indent if there's a previous sibling to nest under.
  if (!item.prevSibling) {
    return true; // consume the key but do nothing
  }

  const indentStep = BULLET_MARKERS.has(item.marker)
    ? BULLET_INDENT
    : ORDERED_INDENT;
  const indentStr = " ".repeat(indentStep);

  // Indent all lines of this item and its descendants.
  const lineRanges = collectItemLineRanges(view.state, item);
  const changes = lineRanges.map((range) => ({
    from: range.from,
    insert: indentStr,
  }));

  view.dispatch({
    changes,
    selection: EditorSelection.cursor(selection.head + indentStep),
  });

  return true;
}

function outdentListItem(view: EditorView) {
  const selection = view.state.selection.main;
  if (!selection.empty) {
    return indentLess(view);
  }

  const item = getListItemForLine(view.state, selection.head);
  if (!item) {
    return indentLess(view);
  }

  // Can only outdent if not already at top level.
  if (item.depth === 0) {
    return true; // consume the key but do nothing
  }

  const indentStep = BULLET_MARKERS.has(item.marker)
    ? BULLET_INDENT
    : ORDERED_INDENT;

  // Figure out how many leading spaces we can remove.
  const line = view.state.doc.lineAt(item.lineFrom);
  const leadingSpaces = /^( *)/.exec(line.text)?.[1].length ?? 0;
  const removable = Math.min(indentStep, leadingSpaces);
  if (removable === 0) {
    return true;
  }

  // Outdent all lines of this item and its descendants.
  const lineRanges = collectItemLineRanges(view.state, item);
  const changes = lineRanges
    .map((range) => {
      const l = view.state.doc.lineAt(range.from);
      const spaces = /^( *)/.exec(l.text)?.[1].length ?? 0;
      const rm = Math.min(removable, spaces);
      return rm > 0 ? { from: l.from, to: l.from + rm } : null;
    })
    .filter((c): c is { from: number; to: number } => c !== null);

  if (changes.length === 0) {
    return true;
  }

  view.dispatch({
    changes,
    selection: EditorSelection.cursor(
      Math.max(line.from, selection.head - removable),
    ),
  });

  return true;
}

function getHiddenContinuationPrefixRange(
  line: DocLine,
  expectedPrefix: string,
): HiddenPrefixRange | null {
  if (!line.text.startsWith(expectedPrefix)) {
    return null;
  }

  const quotePrefix = BLOCKQUOTE_PREFIX_RE.exec(line.text)?.[0] ?? "";
  const from = line.from + quotePrefix.length;
  const to = Math.min(line.from + expectedPrefix.length, line.to);
  return to > from ? { from, to } : null;
}

function buildContinuationPrefixRanges(
  state: EditorState,
): HiddenPrefixRange[] {
  const ranges: HiddenPrefixRange[] = [];

  for (let lineNumber = 2; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const continuationContext = getExplicitContinuationContextForLine(
      state,
      line,
    );
    if (!continuationContext) {
      continue;
    }

    const range = getHiddenContinuationPrefixRange(
      line,
      continuationContext.prefix,
    );
    if (range) {
      ranges.push(range);
    }
  }

  return ranges;
}

function normalizeSelectionToListMarkers(state: EditorState) {
  let changed = false;
  const ranges = state.selection.ranges.map((range) => {
    if (!range.empty) {
      return range;
    }

    const item = getListItemForLine(state, range.head);
    if (item) {
      // Allow the cursor at line.from (before the marker). Snap
      // positions inside the marker/indent area to the text start.
      if (range.head > item.lineFrom && range.head <= item.contentFrom) {
        const targetAssoc = 1;
        if (range.head !== item.contentFrom || range.assoc !== targetAssoc) {
          changed = true;
          return EditorSelection.cursor(item.contentFrom, targetAssoc);
        }
        return range;
      }
    }

    return range;
  });

  if (!changed) {
    return null;
  }

  return EditorSelection.create(ranges, state.selection.mainIndex);
}

export function moveAcrossListBoundary(
  direction: "left" | "right",
  view: EditorView,
) {
  const selection = view.state.selection.main;
  if (!selection.empty) {
    return false;
  }

  const items = getListItems(view.state);
  if (items.length === 0) {
    return false;
  }

  for (const item of items) {
    const marker: MarkerRange = { from: item.markerFrom, to: item.contentFrom };
    if (tryMoveAcrossMarkerRange(direction, view, selection.head, marker)) {
      return true;
    }
  }

  const continuationRanges = buildContinuationPrefixRanges(view.state);
  for (const range of continuationRanges) {
    if (
      tryMoveAcrossContinuationRange(direction, view, selection.head, range)
    ) {
      return true;
    }
  }

  return false;
}

function tryMoveAcrossMarkerRange(
  direction: "left" | "right",
  view: EditorView,
  head: number,
  marker: MarkerRange,
) {
  if (direction === "left" && head === marker.to) {
    view.dispatch({
      selection: EditorSelection.cursor(marker.from, -1),
    });
    return true;
  }

  if (direction === "right" && head === marker.from) {
    view.dispatch({
      selection: EditorSelection.cursor(marker.to, 1),
    });
    return true;
  }

  return false;
}

function tryMoveAcrossContinuationRange(
  direction: "left" | "right",
  view: EditorView,
  head: number,
  range: HiddenPrefixRange,
) {
  if (direction === "left" && head === range.to) {
    const previousLine = view.state.doc.lineAt(Math.max(0, range.from - 1));
    view.dispatch({
      selection: EditorSelection.cursor(previousLine.to),
    });
    return true;
  }

  if (direction === "right" && head === range.from - 1) {
    view.dispatch({
      selection: EditorSelection.cursor(range.to, 1),
    });
    return true;
  }

  return false;
}

function expandSelectionRangeToOverlappingMarkers(
  state: EditorState,
  from: number,
  to: number,
) {
  let nextFrom = from;
  let nextTo = to;

  for (const item of getListItems(state)) {
    const markerFrom = item.markerFrom;
    const markerTo = item.contentFrom;
    if (nextFrom >= markerTo || nextTo <= markerFrom) {
      continue;
    }

    nextFrom = Math.min(nextFrom, markerFrom);
    nextTo = Math.max(nextTo, markerTo);
  }

  const changed = nextFrom !== from || nextTo !== to;
  return { changed, from: nextFrom, to: nextTo };
}

function getExpandedSelectionRangeAcrossListMarkers(
  state: EditorState,
  from: number,
  to: number,
) {
  let nextFrom = from;
  let nextTo = to;
  let changed = false;

  while (true) {
    const expanded = expandSelectionRangeToOverlappingMarkers(
      state,
      nextFrom,
      nextTo,
    );
    if (!expanded.changed) {
      break;
    }

    nextFrom = expanded.from;
    nextTo = expanded.to;
    changed = true;
  }

  return changed ? { from: nextFrom, to: nextTo } : null;
}

function deleteExpandedSelectionAcrossListMarkers(view: EditorView) {
  if (view.state.selection.ranges.length !== 1) {
    return false;
  }

  const selection = view.state.selection.main;
  if (selection.empty) {
    return false;
  }

  const expandedRange = getExpandedSelectionRangeAcrossListMarkers(
    view.state,
    selection.from,
    selection.to,
  );
  if (!expandedRange) {
    return false;
  }

  view.dispatch({
    changes: expandedRange,
    selection: EditorSelection.cursor(expandedRange.from),
    annotations: Transaction.userEvent.of("delete.backward"),
  });
  return true;
}

export function deleteAcrossListBoundary(view: EditorView) {
  const selection = view.state.selection.main;
  if (!selection.empty) {
    return deleteExpandedSelectionAcrossListMarkers(view);
  }

  // --- Continuation line handling (existing behavior) ---

  const currentLine = view.state.doc.lineAt(selection.head);
  const continuationContext = getExplicitContinuationContextForLine(
    view.state,
    currentLine,
  );
  logListDeleteDebug("deleteAcrossListBoundary invoked", {
    continuationContext,
    head: selection.head,
    lineFrom: currentLine.from,
    lineText: currentLine.text,
    lineTo: currentLine.to,
  });
  if (
    continuationContext &&
    currentLine.text === continuationContext.prefix &&
    selection.head >= currentLine.from &&
    selection.head <= currentLine.to
  ) {
    const range = getHiddenContinuationPrefixRange(
      currentLine,
      continuationContext.prefix,
    );
    if (!range) {
      logListDeleteDebug("empty continuation branch had no hidden range", {
        head: selection.head,
        lineText: currentLine.text,
        prefix: continuationContext.prefix,
      });
      return false;
    }

    logListDeleteDebug("deleting empty continuation prefix", {
      head: selection.head,
      lineText: currentLine.text,
      prefix: continuationContext.prefix,
      range,
    });
    const previousLine = view.state.doc.lineAt(
      Math.max(0, currentLine.from - 1),
    );
    view.dispatch({
      changes: {
        from: previousLine.to,
        to: currentLine.to,
      },
      selection: EditorSelection.cursor(previousLine.to),
      annotations: Transaction.userEvent.of("delete.backward"),
    });
    return true;
  }

  const continuationRanges = buildContinuationPrefixRanges(view.state);
  for (const range of continuationRanges) {
    if (selection.head !== range.to) {
      continue;
    }

    logListDeleteDebug("joining continuation line into previous line", {
      head: selection.head,
      range,
    });
    const rangeLine = view.state.doc.lineAt(range.from);
    const previousLine = view.state.doc.lineAt(Math.max(0, rangeLine.from - 1));
    view.dispatch({
      changes: {
        from: previousLine.to,
        to: range.to,
      },
      selection: EditorSelection.cursor(previousLine.to),
      annotations: Transaction.userEvent.of("delete.backward"),
    });
    return true;
  }

  // --- Structural merge: backspace at content start merges with previous item ---

  const item = getListItemForLine(view.state, selection.head);
  if (item && selection.head === item.contentFrom) {
    return mergeWithPreviousListItem(view, item);
  }

  logListDeleteDebug("deleteAcrossListBoundary fell through", {
    continuationRanges,
    head: selection.head,
  });
  return false;
}

/**
 * When backspacing at the content start of a list item, merge its
 * content into the previous item (or the previous line if there is no
 * previous list item). Children of the deleted item are adopted by the
 * previous item.
 */
function mergeWithPreviousListItem(
  view: EditorView,
  item: ListItemInfo,
): boolean {
  const state = view.state;

  // Find what's on the line above this item.
  if (item.lineFrom === 0) {
    return false; // first line of the document
  }

  const previousLine = state.doc.lineAt(item.lineFrom - 1);
  const prevItem = getListItemForLine(state, previousLine.from);

  if (!prevItem) {
    // Previous line is not a list item — merge content into it,
    // removing the marker.
    const content = state.sliceDoc(item.contentFrom, item.lineTo);
    view.dispatch({
      changes: { from: previousLine.to, to: item.lineTo, insert: content },
      selection: EditorSelection.cursor(previousLine.to),
      annotations: Transaction.userEvent.of("delete.backward"),
    });
    return true;
  }

  // Both are list items. Merge this item's first-line content into
  // the end of the previous item's marker line.
  const content = state.sliceDoc(item.contentFrom, item.lineTo);
  const cursorTarget = prevItem.lineTo;

  // Build the change: delete from end of previous line to end of
  // current item's marker line, and insert just the content.
  view.dispatch({
    changes: { from: prevItem.lineTo, to: item.lineTo, insert: content },
    selection: EditorSelection.cursor(cursorTarget),
    annotations: Transaction.userEvent.of("delete.backward"),
  });

  return true;
}

function backspaceRemoveEmptyContinuationPrefix(
  transaction: Transaction,
): TransactionSpec | null {
  const userEvent = transaction.annotation(Transaction.userEvent);
  if (transaction.docChanged && transaction.isUserEvent("delete")) {
    logListDeleteDebug("delete transaction observed", {
      changes: summarizeTransactionChanges(transaction),
      endSelection: {
        anchor: transaction.newSelection.main.anchor,
        head: transaction.newSelection.main.head,
      },
      startSelection: {
        anchor: transaction.startState.selection.main.anchor,
        head: transaction.startState.selection.main.head,
      },
      userEvent,
    });
  }

  if (!transaction.isUserEvent("delete") || !transaction.docChanged) {
    return null;
  }

  const state = transaction.startState;
  const selection = state.selection.main;
  if (!selection.empty) {
    return null;
  }

  const currentLine = state.doc.lineAt(selection.head);
  const continuationContext = getExplicitContinuationContextForLine(
    state,
    currentLine,
  );
  logListDeleteDebug("backspaceRemoveEmptyContinuationPrefix context", {
    continuationContext,
    lineFrom: currentLine.from,
    lineText: currentLine.text,
    lineTo: currentLine.to,
    userEvent,
  });
  if (!continuationContext || currentLine.text !== continuationContext.prefix) {
    return null;
  }

  const range = getHiddenContinuationPrefixRange(
    currentLine,
    continuationContext.prefix,
  );
  if (!range) {
    logListDeleteDebug("backspace fallback found no hidden range", {
      lineText: currentLine.text,
      prefix: continuationContext.prefix,
    });
    return null;
  }

  logListDeleteDebug("backspace fallback removing empty continuation prefix", {
    range,
    selectionHead: selection.head,
  });
  const previousLine = state.doc.lineAt(Math.max(0, currentLine.from - 1));
  return {
    changes: {
      from: previousLine.to,
      to: currentLine.to,
    },
    selection: EditorSelection.cursor(previousLine.to),
    annotations: Transaction.userEvent.of("delete.backward"),
  };
}

function placeCaretAtListMarkerBoundary(
  view: EditorView,
  marker: MarkerRange,
  side: "before" | "after",
) {
  view.dispatch({
    selection: EditorSelection.cursor(
      side === "before" ? marker.from : marker.to,
      side === "before" ? -1 : 1,
    ),
  });
}

function stripNonTightListContinuation(
  transaction: Transaction,
): TransactionSpec | readonly TransactionSpec[] | null {
  if (!transaction.isUserEvent("input") || !transaction.docChanged) {
    return null;
  }

  const state = transaction.startState;
  const selection = state.selection.main;
  if (!selection.empty) {
    return null;
  }

  const line = state.doc.lineAt(selection.head);
  if (!LIST_PREFIX_RE.test(line.text)) {
    return null;
  }

  const allChanges: { from: number; to: number; insert: string }[] = [];
  let found = false;
  let charsRemoved = 0;

  transaction.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    const text = inserted.toString();
    if (/\n\s*\n/.test(text)) {
      found = true;
      const fixedText = text.replace(/\n\s*\n/, "\n");
      charsRemoved = text.length - fixedText.length;
      allChanges.push({ from: fromA, to: toA, insert: fixedText });
    } else {
      allChanges.push({ from: fromA, to: toA, insert: text });
    }
  });

  if (!found) {
    return null;
  }

  const originalCursor = transaction.newSelection.main.head;

  return {
    changes: allChanges,
    selection: EditorSelection.cursor(originalCursor - charsRemoved),
    annotations: Transaction.userEvent.of("input"),
  };
}

function backspaceRemoveListPrefix(
  transaction: Transaction,
): TransactionSpec | readonly TransactionSpec[] | null {
  if (!transaction.isUserEvent("delete") || !transaction.docChanged) {
    return null;
  }

  const state = transaction.startState;
  const selection = state.selection.main;
  if (!selection.empty) {
    return null;
  }

  const line = state.doc.lineAt(selection.head);
  const match = LIST_PREFIX_RE.exec(line.text);
  if (!match) {
    return null;
  }

  const textStart = getListTextStart(line.text, line.from, line.to);
  if (selection.head > textStart) {
    return null;
  }

  const indent = match[1] ?? "";
  const indentStep = getListIndentStep(line.text);
  if (indent.length >= indentStep) {
    // De-indent one level, keeping the marker
    const removeFrom = line.from;
    const removeTo = line.from + Math.min(indent.length, indentStep);
    return {
      changes: { from: removeFrom, to: removeTo },
      annotations: Transaction.userEvent.of("delete.backward"),
    };
  }

  // At zero indent (or less than one tab): remove the entire prefix
  return {
    changes: { from: line.from, to: textStart },
    annotations: Transaction.userEvent.of("delete.backward"),
  };
}

// ---------------------------------------------------------------------------
// Unified list decoration builder — single tree walk + line pass
// ---------------------------------------------------------------------------

const LIST_VISIBLE_RANGE_MARGIN = 1000;

function expandedVisibleRanges(
  view: EditorView,
): { from: number; to: number }[] {
  const docLength = view.state.doc.length;
  const ranges: { from: number; to: number }[] = [];

  for (const { from, to } of view.visibleRanges) {
    const expanded = {
      from: Math.max(0, from - LIST_VISIBLE_RANGE_MARGIN),
      to: Math.min(docLength, to + LIST_VISIBLE_RANGE_MARGIN),
    };
    // eslint-disable-next-line unicorn/prefer-at
    const last = ranges.length > 0 ? ranges[ranges.length - 1] : undefined;
    if (last && expanded.from <= last.to) {
      last.to = Math.max(last.to, expanded.to);
    } else {
      ranges.push(expanded);
    }
  }

  return ranges;
}

function addMarkerDecorationsFromModel(
  item: ListItemInfo,
  decorationRanges: Range<Decoration>[],
  atomicRanges: Range<Decoration>[],
) {
  const isBullet = BULLET_MARKERS.has(item.marker);

  if (isBullet && item.task) {
    const { checked } = item.task;
    const taskMarkerDecoration = Decoration.replace({
      widget: new TaskMarkerWidget(checked, item.task.from),
    });
    decorationRanges.push(
      Decoration.line({
        attributes: {
          class: `cm-md-list cm-md-task-list ${checked ? "cm-md-task-checked" : "cm-md-task-unchecked"}`,
          style: `--indent-level: ${item.indentLevel}`,
        },
      }).range(item.lineFrom),
      Decoration.replace({}).range(item.markerFrom, item.markerTo),
      taskMarkerDecoration.range(item.task.from, item.task.to + 1),
    );
    atomicRanges.push(
      taskMarkerDecoration.range(item.task.from, item.task.to + 1),
    );

    if (item.task.to + 1 >= item.lineTo) {
      decorationRanges.push(
        Decoration.widget({
          side: -1,
          widget: new EmptyTaskPlaceholderWidget(),
        }).range(item.lineTo),
      );
    }

    if (checked && item.task.to + 1 < item.lineTo) {
      decorationRanges.push(
        Decoration.mark({
          class: "cm-md-task-content-checked",
        }).range(item.task.to + 1, item.lineTo),
      );
    }
    return;
  }

  if (isBullet) {
    addListDecorations(
      item,
      "cm-md-list cm-md-bullet-list",
      Decoration.mark({
        class: "cm-md-list-marker cm-md-bullet-marker-source",
      }).range(item.markerFrom, item.markerTo),
      decorationRanges,
      atomicRanges,
    );
    return;
  }

  addListDecorations(
    item,
    "cm-md-list cm-md-number-list",
    Decoration.mark({
      class: "cm-md-list-marker cm-md-number-marker-source",
      attributes: {
        style: `--display-number: "${item.marker} "`,
      },
    }).range(item.markerFrom, item.markerTo),
    decorationRanges,
    atomicRanges,
  );
}

function buildAllListDecorations(
  view: EditorView,
): [DecorationSet, DecorationSet] {
  const state = view.state;
  const visibleRanges = expandedVisibleRanges(view);
  const decorationRanges: Range<Decoration>[] = [];
  const atomicRanges: Range<Decoration>[] = [];

  // ---- Pass 1: iterate model items for markers + child blocks -------------
  const items = getListItems(state);
  for (const item of items) {
    // Skip items outside visible ranges.
    if (
      !visibleRanges.some((r) => item.lineFrom <= r.to && item.lineTo >= r.from)
    ) {
      continue;
    }

    // -- Marker decorations (bullets / numbers / tasks) --
    addMarkerDecorationsFromModel(item, decorationRanges, atomicRanges);

    // -- Child-block decorations (continuation lines within ListItems) --
    let previousChildLineEnd = item.lineTo;

    for (let child = item.node.firstChild; child; child = child.nextSibling) {
      if (isListContainerNode(child)) {
        continue;
      }

      previousChildLineEnd = decorateListChildNode(
        state,
        child,
        item.lineFrom,
        item.continuationPrefix,
        item.indentStyle,
        previousChildLineEnd,
        decorationRanges,
        atomicRanges,
      );
    }
  }

  // ---- Pass 2: line iteration for pending continuations ------------------
  // Scoped to visible ranges to avoid scanning the entire document.
  for (const range of visibleRanges) {
    const startLine = state.doc.lineAt(range.from);
    const endLine = state.doc.lineAt(range.to);
    for (
      let lineNumber = Math.max(2, startLine.number);
      lineNumber <= endLine.number;
      lineNumber += 1
    ) {
      const line = state.doc.line(lineNumber);
      const continuationContext = getExplicitContinuationContextForLine(
        state,
        line,
      );
      if (!continuationContext || line.text !== continuationContext.prefix) {
        continue;
      }

      decorationRanges.push(
        Decoration.line({
          attributes: {
            class: "cm-md-list-child cm-md-list-child-draft",
            style: continuationContext.indentStyle,
          },
        }).range(line.from),
      );

      const hiddenPrefix = Decoration.replace({});
      decorationRanges.push(hiddenPrefix.range(line.from, line.to));
      atomicRanges.push(hiddenPrefix.range(line.from, line.to));
    }
  }

  return [
    Decoration.set(decorationRanges, true),
    Decoration.set(atomicRanges, true),
  ];
}

function isListContainerNode(node: SyntaxNodeRef["node"]) {
  return (
    node.type.name === "ListMark" ||
    node.type.name === "QuoteMark" ||
    node.type.name === "BulletList" ||
    node.type.name === "OrderedList"
  );
}

function addParagraphPrefixDecorations(
  state: EditorState,
  child: SyntaxNode,
  markerLineStart: number,
  expectedPrefix: string,
  decorationRanges: Range<Decoration>[],
  atomicRanges: Range<Decoration>[],
) {
  if (child.type.name !== "Paragraph") {
    return;
  }

  let line = state.doc.lineAt(child.from);
  while (true) {
    if (line.from !== markerLineStart && line.text.startsWith(expectedPrefix)) {
      const quotePrefix = BLOCKQUOTE_PREFIX_RE.exec(line.text)?.[0] ?? "";
      const hideFrom = line.from + quotePrefix.length;
      const hideTo = Math.min(line.from + expectedPrefix.length, line.to);

      if (hideTo > hideFrom) {
        const prefixDecoration = Decoration.replace({});
        decorationRanges.push(prefixDecoration.range(hideFrom, hideTo));
        atomicRanges.push(prefixDecoration.range(hideFrom, hideTo));
      }
    }

    if (line.to >= child.to || line.to + 1 > state.doc.length) {
      break;
    }

    line = state.doc.lineAt(line.to + 1);
  }
}

function addListChildGapDecorations(
  state: EditorState,
  previousChildLineEnd: number,
  childLineStart: number,
  markerLineStart: number,
  indentStyle: string,
  decorationRanges: Range<Decoration>[],
) {
  if (previousChildLineEnd + 1 > childLineStart - 1) {
    return;
  }

  addListChildLineDecorations(
    state,
    previousChildLineEnd + 1,
    childLineStart - 1,
    markerLineStart,
    indentStyle,
    decorationRanges,
  );
}

function decorateListChildNode(
  state: EditorState,
  child: SyntaxNode,
  markerLineStart: number,
  expectedPrefix: string,
  indentStyle: string,
  previousChildLineEnd: number,
  decorationRanges: Range<Decoration>[],
  atomicRanges: Range<Decoration>[],
) {
  addParagraphPrefixDecorations(
    state,
    child,
    markerLineStart,
    expectedPrefix,
    decorationRanges,
    atomicRanges,
  );

  const childLineStart = state.doc.lineAt(child.from).from;
  addListChildGapDecorations(
    state,
    previousChildLineEnd,
    childLineStart,
    markerLineStart,
    indentStyle,
    decorationRanges,
  );

  if (child.type.name === "Paragraph") {
    addParagraphChildLineDecorations(
      state,
      child,
      markerLineStart,
      expectedPrefix,
      indentStyle,
      decorationRanges,
    );
  } else {
    addListChildLineDecorations(
      state,
      child.from,
      child.to,
      markerLineStart,
      indentStyle,
      decorationRanges,
    );
  }

  return state.doc.lineAt(child.to).to;
}

function allListDecorations(): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      atomicRanges: DecorationSet;

      constructor(view: EditorView) {
        const [decorations, atomicRanges] = buildAllListDecorations(view);
        this.decorations = decorations;
        this.atomicRanges = atomicRanges;
      }

      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.viewportChanged ||
          syntaxTree(update.state) !== syntaxTree(update.startState)
        ) {
          const [decorations, atomicRanges] = buildAllListDecorations(
            update.view,
          );
          this.decorations = decorations;
          this.atomicRanges = atomicRanges;
        }
      }
    },
    {
      decorations: (v) => v.decorations,
      provide: (p) =>
        EditorView.atomicRanges.of(
          (view) => view.plugin(p)?.atomicRanges ?? Decoration.none,
        ),
    },
  );

  return plugin;
}

function taskListInteractions(): Extension {
  return [
    ViewPlugin.define(() => ({}), {
      eventHandlers: {
        mousedown(event) {
          const target = event.target as HTMLElement;
          const marker = target.closest(".cm-md-task-marker-box");
          if (!(marker instanceof HTMLElement) || event.button !== 0) {
            return false;
          }

          event.preventDefault();
          event.stopPropagation();
          return true;
        },
        click(event, view) {
          const target = event.target as HTMLElement;
          const checkbox = target.closest(".cm-md-task-marker-box");
          if (!(checkbox instanceof HTMLElement)) {
            return false;
          }

          const marker = checkbox.closest(".cm-md-task-marker-source");
          if (!(marker instanceof HTMLElement)) {
            return false;
          }

          event.preventDefault();
          event.stopPropagation();

          const from = Number(
            marker.dataset.taskStart ?? view.posAtDOM(marker, 0),
          );
          const to = from + 3;
          const taskMarker = view.state.sliceDoc(from, to);

          if (taskMarker === "[ ]" || taskMarker === "[x]") {
            view.dispatch({
              changes: {
                from,
                to,
                insert: taskMarker === "[ ]" ? "[x]" : "[ ]",
              },
            });
            return true;
          }

          return false;
        },
      },
    }),
  ];
}

function listMarkerInteractions(): Extension {
  return ViewPlugin.define(() => ({}), {
    eventHandlers: {
      click(event, view) {
        const target = event.target as HTMLElement;
        if (event.button !== 0) {
          return false;
        }

        if (target.closest(".cm-md-task-marker-box")) {
          return false;
        }

        const marker = target.closest(
          ".cm-md-bullet-marker-source, .cm-md-number-marker-source, .cm-md-task-marker-source",
        );
        if (!(marker instanceof HTMLElement)) {
          return false;
        }

        if (!view.state.selection.main.empty) {
          return false;
        }

        const pos = view.posAtDOM(marker, 0);
        const listItem = getListItemForLine(view.state, pos);
        if (!listItem) {
          return false;
        }
        const markerRange: MarkerRange = {
          from: listItem.markerFrom,
          to: listItem.contentFrom,
        };

        const rect = marker.getBoundingClientRect();
        placeCaretAtListMarkerBoundary(
          view,
          markerRange,
          event.clientX < rect.left + rect.width / 2 ? "before" : "after",
        );
        event.preventDefault();
        event.stopPropagation();
        return true;
      },
    },
  });
}

const listInputHandler = EditorView.inputHandler.of((view, from, to, text) => {
  const shortcut = getTaskListShortcut(view.state, from, to, text);
  if (!shortcut) {
    return false;
  }

  view.dispatch(shortcut);
  return true;
});

const listNavigationKeymap = Prec.high(
  keymap.of([
    { key: "Backspace", run: deleteAcrossListBoundary },
    { key: "ArrowLeft", run: (view) => moveAcrossListBoundary("left", view) },
    {
      key: "ArrowRight",
      run: (view) => moveAcrossListBoundary("right", view),
    },
  ]),
);

const listBreakKeymap = Prec.high(
  keymap.of([
    {
      key: "Enter",
      run: insertExplicitContinuationAfterContinuationLine,
    },
    {
      key: "Shift-Enter",
      run: insertExplicitListContinuationBlock,
    },
  ]),
);

const listEditKeymap = keymap.of([
  { key: "Mod-t", run: insertTaskCheckbox },
  { key: "Tab", run: indentListItem },
  { key: "Shift-Tab", run: outdentListItem },
]);

export function lists(): Extension {
  const decorationsDisabled = isListDecorationsDisabled();
  const interactionsDisabled = isListInteractionsDisabled();
  const selectionNormalizationDisabled = isListSelectionNormalizationDisabled();
  const selectionNormalizationExtensions = selectionNormalizationDisabled
    ? []
    : [
        EditorState.transactionFilter.of(
          (transaction): readonly TransactionSpec[] => {
            const tightContinuation =
              stripNonTightListContinuation(transaction);
            if (tightContinuation) {
              return [tightContinuation as TransactionSpec];
            }

            const emptyContinuationPrefix =
              backspaceRemoveEmptyContinuationPrefix(transaction);
            if (emptyContinuationPrefix) {
              return [emptyContinuationPrefix];
            }

            const listPrefixRemoval = backspaceRemoveListPrefix(transaction);
            if (listPrefixRemoval) {
              return [listPrefixRemoval as TransactionSpec];
            }

            const selection = normalizeSelectionToListMarkers(
              transaction.state,
            );
            return selection
              ? [transaction, { selection, sequential: true }]
              : [transaction];
          },
        ),
      ];
  const decorationExtensions = decorationsDisabled
    ? []
    : [allListDecorations()];
  const interactionExtensions = interactionsDisabled
    ? []
    : [
        taskListInteractions(),
        listMarkerInteractions(),
        listInputHandler,
        listNavigationKeymap,
        listBreakKeymap,
        listEditKeymap,
      ];

  return [
    ...selectionNormalizationExtensions,
    ...decorationExtensions,
    ...interactionExtensions,
    listTheme,
  ];
}
