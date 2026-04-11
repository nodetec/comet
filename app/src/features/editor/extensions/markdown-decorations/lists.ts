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
  WidgetType,
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

const BULLET_INDENT = 2;
const ORDERED_INDENT = 3;
const LIST_INDENT_STEP = "1.5rem";
const LIST_MARKER_WIDTH = "2.2rem";
const LIST_CHILD_BLOCK_OFFSET = LIST_MARKER_WIDTH;
const LIST_SOURCE_INDENT_CHAR_WIDTH = "0.25rem";
const BLOCKQUOTE_PREFIX_RE = /^(?:[ \t]{0,3}> ?)+/;
const BULLET_MARKERS = new Set(["-", "*", "+"]);
const LIST_PREFIX_RE = /^(\s*)([-*+]|\d+[.)]) (\[[ xX]\] )?/;
const TASK_MARKERS = new Set(["[ ]", "[x]"]);

type ListMarkerData = {
  indentLevel: number;
  lineStart: number;
  sourceIndentChars: number;
  marker: string;
  markerEnd: number;
  markerStart: number;
};

type MarkerRange = {
  from: number;
  to: number;
};

type HiddenPrefixRange = {
  from: number;
  to: number;
};

type TaskListShortcut = {
  changes: {
    from: number;
    insert: string;
    to: number;
  };
  selection: EditorSelection;
};

class TaskMarkerWidget extends WidgetType {
  constructor(
    private readonly checked: boolean,
    private readonly taskStart: number,
  ) {
    super();
  }

  override eq(other: WidgetType): boolean {
    return (
      other instanceof TaskMarkerWidget &&
      other.checked === this.checked &&
      other.taskStart === this.taskStart
    );
  }

  override ignoreEvent(): boolean {
    return false;
  }

  override toDOM(): HTMLElement {
    const marker = document.createElement("span");
    marker.className = `cm-md-list-marker cm-md-task-marker-source ${this.checked ? "cm-md-task-marker-checked" : "cm-md-task-marker-unchecked"}`;
    marker.dataset.taskStart = String(this.taskStart);
    const checkbox = document.createElement("span");
    checkbox.className = "cm-md-task-marker-box";
    marker.append(checkbox);
    return marker;
  }
}

class EmptyTaskPlaceholderWidget extends WidgetType {
  override eq(other: WidgetType): boolean {
    return other instanceof EmptyTaskPlaceholderWidget;
  }

  override ignoreEvent(): boolean {
    return true;
  }

  override toDOM(): HTMLElement {
    const placeholder = document.createElement("span");
    placeholder.className = "cm-md-task-empty-placeholder";
    placeholder.setAttribute("aria-hidden", "true");
    placeholder.textContent = "\u200B";
    return placeholder;
  }
}

type ListMarkerNodeRef = Pick<SyntaxNodeRef, "from" | "to" | "type" | "node">;
type DocLine = ReturnType<EditorState["doc"]["lineAt"]>;

export function getListMarkerData(
  state: EditorState,
  { from, to, type, node }: ListMarkerNodeRef,
): ListMarkerData | null {
  if (type.name !== "ListMark") {
    return null;
  }

  const line = state.doc.lineAt(from);
  const marker = state.sliceDoc(from, to);
  const markerHasTrailingSpace = state.sliceDoc(to, to + 1) === " ";

  if (!markerHasTrailingSpace) {
    return null;
  }

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
  const sourceIndentChars = Math.max(0, from - line.from - quotePrefix.length);

  return {
    indentLevel,
    lineStart: line.from,
    sourceIndentChars,
    marker,
    markerEnd: to,
    markerStart: from,
  };
}

function addListDecorations(
  data: ListMarkerData,
  lineClass: string,
  markerDecoration: Range<Decoration>,
  decorationRanges: Range<Decoration>[],
  _atomicRanges: Range<Decoration>[],
) {
  decorationRanges.push(
    Decoration.line({
      attributes: {
        class: lineClass,
        style: `--indent-level: ${data.indentLevel}`,
      },
    }).range(data.lineStart),
    markerDecoration,
  );
}

function buildListChildIndentStyle(
  indentLevel: number,
  sourceIndentChars: number,
) {
  return `--cm-md-list-child-indent: calc(${indentLevel} * ${LIST_INDENT_STEP} + ${LIST_CHILD_BLOCK_OFFSET} + ${sourceIndentChars} * ${LIST_SOURCE_INDENT_CHAR_WIDTH})`;
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

function getListMarkerDataForLine(
  state: EditorState,
  lineFrom: number,
  lineTo: number,
): ListMarkerData | null {
  let markerData: ListMarkerData | null = null;

  syntaxTree(state).iterate({
    from: lineFrom,
    to: lineTo,
    enter(node) {
      const data = getListMarkerData(state, node);
      if (!data || data.lineStart !== lineFrom) {
        return;
      }

      markerData = data;
      return false;
    },
  });

  return markerData;
}

function getListContinuationIndent(marker: string) {
  return BULLET_MARKERS.has(marker) ? BULLET_INDENT : ORDERED_INDENT;
}

function getExpectedContinuationPrefix(
  state: EditorState,
  markerData: ListMarkerData,
) {
  const markerPrefix = state.sliceDoc(
    markerData.lineStart,
    markerData.markerStart,
  );
  return (
    markerPrefix + " ".repeat(getListContinuationIndent(markerData.marker))
  );
}

type ExplicitContinuationContext = {
  indentStyle: string;
  prefix: string;
};

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
  // This is O(depth) instead of a full-tree iteration.
  const tree = syntaxTree(state);
  let listItem: SyntaxNode | null = null;
  for (
    let n: SyntaxNode | null = tree.resolveInner(targetLineFrom, 1);
    n;
    n = n.parent
  ) {
    if (n.type.name === "ListItem") {
      listItem = n;
      break;
    }
  }

  if (!listItem) {
    return null;
  }

  const markerContext = getListItemMarkerContext(state, listItem);
  if (!markerContext) {
    return null;
  }

  const { markerData, markerLineStart } = markerContext;
  const expectedPrefix = getExpectedContinuationPrefix(state, markerData);
  const line = state.doc.lineAt(targetLineFrom);

  if (line.from !== targetLineFrom || line.from === markerLineStart) {
    return null;
  }

  if (!line.text.startsWith(expectedPrefix)) {
    return null;
  }

  // Verify the target line is inside a Paragraph child of this ListItem.
  for (let child = listItem.firstChild; child; child = child.nextSibling) {
    if (
      child.type.name === "Paragraph" &&
      targetLineFrom >= child.from &&
      targetLineFrom <= child.to
    ) {
      return {
        indentStyle: buildListChildIndentStyle(
          markerData.indentLevel,
          markerData.sourceIndentChars,
        ),
        prefix: expectedPrefix,
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
      const markerData = getListMarkerDataForLine(
        state,
        previousLine.from,
        previousLine.to,
      );
      return markerData
        ? {
            indentStyle: buildListChildIndentStyle(
              markerData.indentLevel,
              markerData.sourceIndentChars,
            ),
            prefix: getExpectedContinuationPrefix(state, markerData),
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

  const markerData = getListMarkerDataForLine(view.state, line.from, line.to);
  if (!markerData) {
    return false;
  }

  const insert = `\n${getExpectedContinuationPrefix(view.state, markerData)}`;
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

function getCaretRect(view: EditorView, position: number) {
  return view.coordsAtPos(position, 1) ?? view.coordsAtPos(position, -1);
}

function getVisualFragmentStarts(view: EditorView, from: number, to: number) {
  const starts: number[] = [];
  let previousTop: number | null = null;

  for (let position = from; position <= to; position += 1) {
    const rect = getCaretRect(view, position);
    if (!rect) {
      continue;
    }

    if (previousTop === null || Math.abs(rect.top - previousTop) > 0.5) {
      starts.push(position);
      previousTop = rect.top;
    }
  }

  return starts;
}

function getVisualFragmentIndex(position: number, starts: readonly number[]) {
  if (starts.length === 0) {
    return -1;
  }

  for (let index = starts.length - 1; index >= 0; index -= 1) {
    if (position >= starts[index]) {
      return index;
    }
  }

  return 0;
}

function indentListItemPreservingWrappedStart(view: EditorView) {
  const selection = view.state.selection.main;
  if (!selection.empty) {
    return indentMore(view);
  }

  const line = view.state.doc.lineAt(selection.head);
  if (!LIST_PREFIX_RE.test(line.text)) {
    return indentMore(view);
  }

  const textStart = getListTextStart(line.text, line.from, line.to);
  const starts = getVisualFragmentStarts(view, textStart, line.to);
  const fragmentIndex = getVisualFragmentIndex(selection.head, starts);
  const fragmentStart = fragmentIndex >= 0 ? starts[fragmentIndex] : null;

  if (fragmentStart == null || selection.head !== fragmentStart) {
    return indentMore(view);
  }

  const indentStep = getListIndentStep(line.text);
  const indentStr = " ".repeat(indentStep);
  view.dispatch({
    changes: { from: line.from, insert: indentStr },
    selection: EditorSelection.cursor(selection.head + indentStep),
  });

  const nextLine = view.state.doc.lineAt(selection.head + indentStep);
  const nextTextStart = getListTextStart(
    nextLine.text,
    nextLine.from,
    nextLine.to,
  );
  const nextStarts = getVisualFragmentStarts(view, nextTextStart, nextLine.to);
  const nextFragmentStart =
    nextStarts[Math.min(fragmentIndex, nextStarts.length - 1)];

  if (nextFragmentStart != null) {
    view.dispatch({
      selection: EditorSelection.cursor(nextFragmentStart, 1),
    });
  }

  return true;
}

function dedentListItemPreservingWrappedStart(view: EditorView) {
  const selection = view.state.selection.main;
  if (!selection.empty) {
    return indentLess(view);
  }

  const line = view.state.doc.lineAt(selection.head);
  if (!LIST_PREFIX_RE.test(line.text)) {
    return indentLess(view);
  }

  const indentStep = getListIndentStep(line.text);
  let removableIndent = 0;
  const leadingSpaces = /^( *)/.exec(line.text)?.[1].length ?? 0;
  if (leadingSpaces >= indentStep) {
    removableIndent = indentStep;
  } else if (leadingSpaces > 0) {
    removableIndent = leadingSpaces;
  }

  if (removableIndent === 0) {
    return true;
  }

  const textStart = getListTextStart(line.text, line.from, line.to);
  const starts = getVisualFragmentStarts(view, textStart, line.to);
  const fragmentIndex = getVisualFragmentIndex(selection.head, starts);
  const fragmentStart = fragmentIndex >= 0 ? starts[fragmentIndex] : null;

  if (fragmentStart == null || selection.head !== fragmentStart) {
    return indentLess(view);
  }

  view.dispatch({
    changes: { from: line.from, to: line.from + removableIndent },
    selection: EditorSelection.cursor(
      Math.max(line.from, selection.head - removableIndent),
      1,
    ),
  });

  const nextLine = view.state.doc.lineAt(
    Math.max(line.from, selection.head - removableIndent),
  );
  const nextTextStart = getListTextStart(
    nextLine.text,
    nextLine.from,
    nextLine.to,
  );
  const nextStarts = getVisualFragmentStarts(view, nextTextStart, nextLine.to);
  const nextFragmentStart =
    nextStarts[Math.min(fragmentIndex, nextStarts.length - 1)];

  if (nextFragmentStart != null) {
    view.dispatch({
      selection: EditorSelection.cursor(nextFragmentStart, 1),
    });
  }

  return true;
}

// Cache marker ranges per state to avoid multiple full-tree iterations
// in the same update cycle (transaction filter + selection normalization
// can both call this).
let cachedMarkerState: EditorState | null = null;
let cachedMarkerRanges: MarkerRange[] = [];

function buildListMarkerRanges(state: EditorState): MarkerRange[] {
  if (cachedMarkerState === state) {
    return cachedMarkerRanges;
  }

  const ranges: MarkerRange[] = [];

  syntaxTree(state).iterate({
    enter(node) {
      if (node.type.name === "Blockquote") {
        return false;
      }

      const data = getListMarkerData(state, node);
      if (!data) {
        return;
      }

      if (BULLET_MARKERS.has(data.marker)) {
        const taskStart = data.markerEnd + 1;
        const taskEnd = taskStart + 3;
        const task = state.sliceDoc(taskStart, taskEnd);
        const taskHasTrailingSpace =
          state.sliceDoc(taskEnd, taskEnd + 1) === " ";

        if (TASK_MARKERS.has(task) && taskHasTrailingSpace) {
          ranges.push({ from: data.markerStart, to: taskEnd + 1 });
          return;
        }

        ranges.push({ from: data.markerStart, to: data.markerEnd + 1 });
        return;
      }

      ranges.push({ from: data.markerStart, to: data.markerEnd + 1 });
    },
  });

  cachedMarkerState = state;
  cachedMarkerRanges = ranges;
  return ranges;
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

function findMarkerRangeAtPosition(
  state: EditorState,
  position: number,
): MarkerRange | null {
  for (const marker of buildListMarkerRanges(state)) {
    if (position >= marker.from && position <= marker.to) {
      return marker;
    }
  }

  return null;
}

function getCursorBoundary(
  position: number,
  _assoc: -1 | 0 | 1,
  marker: MarkerRange,
) {
  if (position === marker.from || position === marker.to) {
    return null;
  }

  if (position <= marker.from || position >= marker.to) {
    return null;
  }

  return { assoc: 1 as const, position: marker.to };
}

/**
 * Find the list marker range on the line containing `pos` by iterating
 * only that line's syntax nodes instead of the entire tree.
 */
function getMarkerRangeOnLine(
  state: EditorState,
  pos: number,
): MarkerRange | null {
  const line = state.doc.lineAt(pos);
  let result: MarkerRange | null = null;

  syntaxTree(state).iterate({
    from: line.from,
    to: line.to,
    enter(node) {
      if (result) return false;
      if (node.type.name === "Blockquote") return false;

      const data = getListMarkerData(state, node);
      if (!data) return;

      if (BULLET_MARKERS.has(data.marker)) {
        const taskStart = data.markerEnd + 1;
        const taskEnd = taskStart + 3;
        const task = state.sliceDoc(taskStart, taskEnd);
        const taskHasTrailingSpace =
          state.sliceDoc(taskEnd, taskEnd + 1) === " ";

        if (TASK_MARKERS.has(task) && taskHasTrailingSpace) {
          result = { from: data.markerStart, to: taskEnd + 1 };
          return false;
        }

        result = { from: data.markerStart, to: data.markerEnd + 1 };
        return false;
      }

      result = { from: data.markerStart, to: data.markerEnd + 1 };
      return false;
    },
  });

  return result;
}

function normalizeSelectionToListMarkers(state: EditorState) {
  let changed = false;
  const ranges = state.selection.ranges.map((range) => {
    if (!range.empty) {
      return range;
    }

    // Find the marker on the cursor's line (cheap, line-local tree walk).
    const marker = getMarkerRangeOnLine(state, range.head);
    if (marker) {
      const line = state.doc.lineAt(marker.from);
      // Snap cursor in the indent/spacer/marker area to the text start.
      if (range.head >= line.from && range.head <= marker.to) {
        const targetAssoc = 1;
        if (range.head !== marker.to || range.assoc !== targetAssoc) {
          changed = true;
          return EditorSelection.cursor(marker.to, targetAssoc);
        }
        return range;
      }

      // Snap cursor inside the marker range to the boundary.
      const boundary = getCursorBoundary(range.head, range.assoc, marker);
      if (boundary) {
        const normalized = EditorSelection.cursor(
          boundary.position,
          boundary.assoc,
        );
        if (
          normalized.anchor !== range.anchor ||
          normalized.head !== range.head ||
          normalized.assoc !== range.assoc
        ) {
          changed = true;
          return normalized;
        }
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

  const markerRanges = buildListMarkerRanges(view.state);
  if (markerRanges.length === 0) {
    return false;
  }

  for (const marker of markerRanges) {
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

  for (const marker of buildListMarkerRanges(state)) {
    if (nextFrom >= marker.to || nextTo <= marker.from) {
      continue;
    }

    nextFrom = Math.min(nextFrom, marker.from);
    nextTo = Math.max(nextTo, marker.to);
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

  logListDeleteDebug("deleteAcrossListBoundary fell through", {
    continuationRanges,
    head: selection.head,
  });
  return false;
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

function addMarkerDecorations(
  state: EditorState,
  data: ListMarkerData,
  decorationRanges: Range<Decoration>[],
  atomicRanges: Range<Decoration>[],
) {
  const isBullet = BULLET_MARKERS.has(data.marker);

  if (isBullet) {
    const taskStart = data.markerEnd + 1;
    const taskEnd = taskStart + 3;
    const task = state.sliceDoc(taskStart, taskEnd);
    const taskHasTrailingSpace = state.sliceDoc(taskEnd, taskEnd + 1) === " ";

    if (TASK_MARKERS.has(task) && taskHasTrailingSpace) {
      const checked = task === "[x]";
      const line = state.doc.lineAt(data.lineStart);
      const taskMarkerDecoration = Decoration.replace({
        widget: new TaskMarkerWidget(checked, taskStart),
      });
      decorationRanges.push(
        Decoration.line({
          attributes: {
            class: `cm-md-list cm-md-task-list ${checked ? "cm-md-task-checked" : "cm-md-task-unchecked"}`,
            style: `--indent-level: ${data.indentLevel}`,
          },
        }).range(data.lineStart),
        Decoration.replace({}).range(data.markerStart, data.markerEnd + 1),
        taskMarkerDecoration.range(taskStart, taskEnd + 1),
      );
      atomicRanges.push(taskMarkerDecoration.range(taskStart, taskEnd + 1));

      if (taskEnd + 1 >= line.to) {
        decorationRanges.push(
          Decoration.widget({
            side: -1,
            widget: new EmptyTaskPlaceholderWidget(),
          }).range(line.to),
        );
      }

      if (checked && taskEnd + 1 < line.to) {
        decorationRanges.push(
          Decoration.mark({
            class: "cm-md-task-content-checked",
          }).range(taskEnd + 1, line.to),
        );
      }
      return;
    }

    addListDecorations(
      data,
      "cm-md-list cm-md-bullet-list",
      Decoration.mark({
        class: "cm-md-list-marker cm-md-bullet-marker-source",
      }).range(data.markerStart, data.markerEnd + 1),
      decorationRanges,
      atomicRanges,
    );
    return;
  }

  addListDecorations(
    data,
    "cm-md-list cm-md-number-list",
    Decoration.mark({
      class: "cm-md-list-marker cm-md-number-marker-source",
      attributes: {
        style: `--display-number: "${data.marker} "`,
      },
    }).range(data.markerStart, data.markerEnd + 1),
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

  // ---- Pass 1: single tree iteration for markers + child blocks ----------
  for (const range of visibleRanges) {
    syntaxTree(state).iterate({
      from: range.from,
      to: range.to,
      enter(node) {
        // -- Marker decorations (bullets / numbers / tasks) --
        const data = getListMarkerData(state, node);
        if (data) {
          addMarkerDecorations(state, data, decorationRanges, atomicRanges);
          return;
        }

        // -- Child-block decorations (continuation lines within ListItems) --
        if (node.type.name !== "ListItem") {
          return;
        }

        const markerContext = getListItemMarkerContext(state, node);
        if (!markerContext) {
          return;
        }

        const { markerData, markerLineStart } = markerContext;
        const indentStyle = buildListChildIndentStyle(
          markerData.indentLevel,
          markerData.sourceIndentChars,
        );
        const expectedPrefix = getExpectedContinuationPrefix(state, markerData);
        let previousChildLineEnd = state.doc.lineAt(markerData.markerEnd).to;

        for (
          let child = node.node.firstChild;
          child;
          child = child.nextSibling
        ) {
          if (isListContainerNode(child)) {
            continue;
          }

          previousChildLineEnd = decorateListChildNode(
            state,
            child,
            markerLineStart,
            expectedPrefix,
            indentStyle,
            previousChildLineEnd,
            decorationRanges,
            atomicRanges,
          );
        }
      },
    });
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

function getListItemMarkerContext(
  state: EditorState,
  node: SyntaxNodeRef,
): { markerData: ListMarkerData; markerLineStart: number } | null {
  for (let child = node.node.firstChild; child; child = child.nextSibling) {
    if (child.type.name !== "ListMark") {
      continue;
    }

    const markerData = getListMarkerData(state, {
      from: child.from,
      node: child,
      to: child.to,
      type: child.type,
    });
    if (!markerData) {
      return null;
    }

    return {
      markerData,
      markerLineStart: state.doc.lineAt(child.from).from,
    };
  }

  return null;
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

        const markerRange = findMarkerRangeAtPosition(
          view.state,
          view.posAtDOM(marker, 0),
        );
        if (!markerRange) {
          return false;
        }

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

const listTheme = EditorView.theme({
  ".cm-md-list": {
    "--cm-md-list-indent-step": LIST_INDENT_STEP,
    "--cm-md-list-marker-width": LIST_MARKER_WIDTH,
    paddingLeft:
      "calc(var(--indent-level) * var(--cm-md-list-indent-step) + var(--cm-md-list-marker-width)) !important",
    textIndent: "calc(var(--cm-md-list-marker-width) * -1)",
  },
  ".cm-md-list *": {
    textIndent: "0",
  },
  ".cm-line.cm-md-list-child:not(.cm-md-codeblock):not(.cm-md-bq)": {
    paddingLeft: "var(--cm-md-list-child-indent)",
  },
  ".cm-md-list-marker": {
    alignItems: "center",
    color: "var(--primary)",
    display: "inline-flex",
    justifyContent: "center",
    lineHeight: "1",
    minWidth: "var(--cm-md-list-marker-width)",
    position: "relative",
    textAlign: "center",
    verticalAlign: "baseline",
    whiteSpace: "pre",
    zIndex: "0",
  },
  ".cm-md-bullet-marker-source": {
    color: "transparent",
    display: "inline-block",
    letterSpacing: "0.65rem",
    width: "var(--cm-md-list-marker-width)",
    WebkitTextFillColor: "transparent",
  },
  ".cm-md-bullet-marker-source::before": {
    alignItems: "center",
    color: "var(--primary)",
    content: '"•"',
    display: "inline-flex",
    fontSize: "1.45em",
    justifyContent: "center",
    left: "50%",
    lineHeight: "1",
    pointerEvents: "none",
    position: "absolute",
    top: "50%",
    transform: "translate(-50%, -50%)",
    WebkitTextFillColor: "var(--primary)",
  },
  ".cm-md-number-marker-source": {
    color: "transparent",
    display: "inline-block",
    width: "var(--cm-md-list-marker-width)",
    WebkitTextFillColor: "transparent",
  },
  ".cm-md-number-marker-source::before": {
    color: "var(--primary)",
    content: "var(--display-number)",
    fontVariantNumeric: "tabular-nums",
    left: "50%",
    lineHeight: "1",
    pointerEvents: "none",
    position: "absolute",
    top: "50%",
    transform: "translate(-50%, -50%)",
    WebkitTextFillColor: "var(--primary)",
  },
  ".cm-md-task-marker-source": {
    cursor: "text",
    display: "inline-flex",
    justifyContent: "center",
    width: "var(--cm-md-list-marker-width)",
  },
  ".cm-md-task-empty-placeholder": {
    display: "inline",
    font: "inherit",
    lineHeight: "inherit",
    opacity: "0",
    pointerEvents: "none",
    userSelect: "none",
    verticalAlign: "baseline",
  },
  ".cm-md-task-marker-box": {
    backgroundColor: "var(--background)",
    border: "1px solid var(--editor-checkbox-border)",
    borderRadius: "0.22em",
    boxSizing: "border-box",
    cursor: "pointer",
    display: "inline-block",
    height: "1.15em",
    lineHeight: "1",
    position: "relative",
    transform: "translateY(0.24em)",
    width: "1.15em",
  },
  ".cm-md-task-marker-checked .cm-md-task-marker-box": {
    backgroundColor: "transparent",
    borderColor: "var(--muted-foreground)",
  },
  ".cm-md-task-marker-checked .cm-md-task-marker-box::after": {
    borderColor: "var(--muted-foreground)",
    borderStyle: "solid",
    borderWidth: "0 2px 2px 0",
    boxSizing: "border-box",
    content: '""',
    height: "0.58em",
    left: "50%",
    pointerEvents: "none",
    position: "absolute",
    top: "50%",
    transform: "translate(-50%, -64%) rotate(45deg)",
    width: "0.34em",
  },
  ".cm-md-task-list.cm-md-task-checked": {
    color: "var(--muted-foreground)",
  },
  ".cm-md-task-content-checked": {
    textDecoration: "line-through",
    textDecorationColor: "var(--muted-foreground)",
  },
  ".cm-md-task-list.cm-md-task-checked .cm-md-link": {
    color: "var(--muted-foreground)",
  },
});

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
  { key: "Tab", run: indentListItemPreservingWrappedStart },
  { key: "Shift-Tab", run: dedentListItemPreservingWrappedStart },
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
