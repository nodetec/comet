import { indentLess, indentMore } from "@codemirror/commands";
import { syntaxTree } from "@codemirror/language";
import {
  EditorSelection,
  EditorState,
  Prec,
  StateField,
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
} from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";

import {
  isListDecorationsDisabled,
  isListInteractionsDisabled,
  isListSelectionNormalizationDisabled,
} from "@/shared/lib/editor-debug";

const BULLET_INDENT = 2;
const ORDERED_INDENT = 3;
const LIST_INDENT_STEP = "1.5rem";
const LIST_MARKER_WIDTH = "2rem";
const LIST_CHILD_BLOCK_OFFSET = LIST_MARKER_WIDTH;
const BULLET_MARKERS = new Set(["-", "*", "+"]);
const LIST_PREFIX_RE = /^(\s*)([-*+]|\d+[.)]) (\[[ xX]\] )?/;
const TASK_MARKERS = new Set(["[ ]", "[x]"]);

type ListMarkerData = {
  indentLevel: number;
  lineStart: number;
  marker: string;
  markerEnd: number;
  markerStart: number;
};

type MarkerRange = {
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

export function getListMarkerData(
  state: EditorState,
  { from, to, type, node }: SyntaxNodeRef,
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

  return {
    indentLevel,
    lineStart: line.from,
    marker,
    markerEnd: to,
    markerStart: from,
  };
}

function createListStateField(
  decorate: (state: EditorState) => [DecorationSet, DecorationSet],
) {
  return StateField.define<[DecorationSet, DecorationSet]>({
    create(state) {
      return decorate(state);
    },
    update(value, transaction) {
      if (!transaction.docChanged) {
        return value;
      }
      return decorate(transaction.state);
    },
    provide(field) {
      return [
        EditorView.decorations.of((view) => view.state.field(field)[0]),
        EditorView.atomicRanges.of((view) => view.state.field(field)[1]),
      ];
    },
  });
}

function addListDecorations(
  data: ListMarkerData,
  lineClass: string,
  markerDecoration: Range<Decoration>,
  decorationRanges: Array<Range<Decoration>>,
  _atomicRanges: Array<Range<Decoration>>,
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

function buildListChildIndentStyle(indentLevel: number) {
  return `--cm-md-list-child-indent: calc(${indentLevel} * ${LIST_INDENT_STEP} + ${LIST_CHILD_BLOCK_OFFSET})`;
}

function addListChildLineDecorations(
  state: EditorState,
  from: number,
  to: number,
  markerLineStart: number,
  indentStyle: string,
  decorationRanges: Array<Range<Decoration>>,
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

function getListTextStart(lineText: string, lineFrom: number, lineTo: number) {
  const match = LIST_PREFIX_RE.exec(lineText);
  return Math.min(lineTo, lineFrom + (match?.[0].length ?? 0));
}

function getListMarkerDataForLine(
  state: EditorState,
  lineFrom: number,
  lineTo: number,
) {
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

export function insertLineBreakWithoutListContinuation(view: EditorView) {
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

  const prefix = view.state.sliceDoc(line.from, markerData.markerStart);
  const insert = `\n${prefix}`;
  const cursor = selection.head + insert.length;

  view.dispatch({
    changes: {
      from: selection.head,
      insert,
      to: selection.head,
    },
    selection: EditorSelection.cursor(cursor),
    annotations: Transaction.userEvent.of("input"),
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

function buildListMarkerRanges(state: EditorState): MarkerRange[] {
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

function normalizeCursorToMarkerBoundary(
  position: number,
  assoc: -1 | 0 | 1,
  markerRanges: readonly MarkerRange[],
) {
  for (const marker of markerRanges) {
    const boundary = getCursorBoundary(position, assoc, marker);
    if (boundary) {
      return EditorSelection.cursor(boundary.position, boundary.assoc);
    }
  }

  return null;
}

function normalizeSelectionToListMarkers(state: EditorState) {
  const markerRanges = buildListMarkerRanges(state);
  if (markerRanges.length === 0) {
    return null;
  }

  let changed = false;
  const ranges = state.selection.ranges.map((range) => {
    if (!range.empty) {
      return range;
    }

    // Snap cursor in the indent/spacer/marker area to the text start.
    // This covers positions inside spacer widgets, at marker boundaries,
    // and in the padding area where drawSelection can't render a cursor.
    for (const marker of markerRanges) {
      const line = state.doc.lineAt(marker.from);
      if (range.head >= line.from && range.head <= marker.to) {
        const isEndOfLine = line.to === marker.to;
        const targetAssoc = isEndOfLine ? -1 : 1;
        if (range.head !== marker.to || range.assoc !== targetAssoc) {
          changed = true;
          return EditorSelection.cursor(marker.to, targetAssoc);
        }
        return range;
      }
    }

    const normalized = normalizeCursorToMarkerBoundary(
      range.head,
      range.assoc,
      markerRanges,
    );
    if (!normalized) {
      return range;
    }

    if (
      normalized.anchor !== range.anchor ||
      normalized.head !== range.head ||
      normalized.assoc !== range.assoc
    ) {
      changed = true;
      return normalized;
    }

    return range;
  });

  if (!changed) {
    return null;
  }

  return EditorSelection.create(ranges, state.selection.mainIndex);
}

function moveAcrossListMarker(direction: "left" | "right", view: EditorView) {
  const selection = view.state.selection.main;
  if (!selection.empty) {
    return false;
  }

  const markerRanges = buildListMarkerRanges(view.state);
  if (markerRanges.length === 0) {
    return false;
  }

  for (const marker of markerRanges) {
    if (direction === "left" && selection.head === marker.to) {
      view.dispatch({
        selection: EditorSelection.cursor(marker.from, -1),
      });
      return true;
    }

    if (direction === "right" && selection.head === marker.from) {
      view.dispatch({
        selection: EditorSelection.cursor(marker.to, 1),
      });
      return true;
    }
  }

  return false;
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

  const allChanges: Array<{ from: number; to: number; insert: string }> = [];
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

function buildBulletListDecorations(
  state: EditorState,
): [DecorationSet, DecorationSet] {
  const decorationRanges: Array<Range<Decoration>> = [];
  const atomicRanges: Array<Range<Decoration>> = [];

  syntaxTree(state).iterate({
    enter(node) {
      const data = getListMarkerData(state, node);
      if (!data || !BULLET_MARKERS.has(data.marker)) {
        return;
      }

      const taskStart = data.markerEnd + 1;
      const taskEnd = taskStart + 3;
      const task = state.sliceDoc(taskStart, taskEnd);
      const taskHasTrailingSpace = state.sliceDoc(taskEnd, taskEnd + 1) === " ";

      if (TASK_MARKERS.has(task) && taskHasTrailingSpace) {
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
    },
  });

  return [
    Decoration.set(decorationRanges, true),
    Decoration.set(atomicRanges, true),
  ];
}

function buildNumberListDecorations(
  state: EditorState,
): [DecorationSet, DecorationSet] {
  const decorationRanges: Array<Range<Decoration>> = [];
  const atomicRanges: Array<Range<Decoration>> = [];

  syntaxTree(state).iterate({
    enter(node) {
      const data = getListMarkerData(state, node);
      if (!data || BULLET_MARKERS.has(data.marker)) {
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
    },
  });

  return [
    Decoration.set(decorationRanges, true),
    Decoration.set(atomicRanges, true),
  ];
}

function buildTaskListDecorations(
  state: EditorState,
): [DecorationSet, DecorationSet] {
  const decorationRanges: Array<Range<Decoration>> = [];
  const atomicRanges: Array<Range<Decoration>> = [];

  syntaxTree(state).iterate({
    enter(node) {
      const data = getListMarkerData(state, node);
      if (!data || !BULLET_MARKERS.has(data.marker)) {
        return;
      }

      const taskStart = data.markerEnd + 1;
      const taskEnd = taskStart + 3;
      const task = state.sliceDoc(taskStart, taskEnd);
      const taskHasTrailingSpace = state.sliceDoc(taskEnd, taskEnd + 1) === " ";

      if (!TASK_MARKERS.has(task) || !taskHasTrailingSpace) {
        return;
      }

      const checked = task === "[x]";
      const line = state.doc.lineAt(data.lineStart);
      decorationRanges.push(
        Decoration.line({
          attributes: {
            class: `cm-md-list cm-md-task-list ${checked ? "cm-md-task-checked" : "cm-md-task-unchecked"}`,
            style: `--indent-level: ${data.indentLevel}`,
          },
        }).range(data.lineStart),
        Decoration.mark({
          class: "cm-md-task-bullet-source",
        }).range(data.markerStart, data.markerEnd + 1),
        Decoration.mark({
          class: `cm-md-list-marker cm-md-task-marker-source ${checked ? "cm-md-task-marker-checked" : "cm-md-task-marker-unchecked"}`,
        }).range(taskStart, taskEnd + 1),
      );

      if (checked && taskEnd + 1 < line.to) {
        decorationRanges.push(
          Decoration.mark({
            class: "cm-md-task-content-checked",
          }).range(taskEnd + 1, line.to),
        );
      }
    },
  });

  return [
    Decoration.set(decorationRanges, true),
    Decoration.set(atomicRanges, true),
  ];
}

function bulletLists(): Extension {
  return createListStateField(buildBulletListDecorations);
}

function numberLists(): Extension {
  return createListStateField(buildNumberListDecorations);
}

function taskListDecorations(): Extension {
  return createListStateField(buildTaskListDecorations);
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

function addParagraphPrefixDecoration(
  state: EditorState,
  child: SyntaxNodeRef["node"],
  markerLineStart: number,
  decorationRanges: Array<Range<Decoration>>,
  atomicRanges: Array<Range<Decoration>>,
) {
  if (child.type.name !== "Paragraph") {
    return;
  }

  const childLine = state.doc.lineAt(child.from);
  if (childLine.from === markerLineStart || childLine.from >= child.from) {
    return;
  }

  const prefixDecoration = Decoration.replace({});
  decorationRanges.push(prefixDecoration.range(childLine.from, child.from));
  atomicRanges.push(prefixDecoration.range(childLine.from, child.from));
}

function addListChildGapDecorations(
  state: EditorState,
  previousChildLineEnd: number,
  childLineStart: number,
  markerLineStart: number,
  indentStyle: string,
  decorationRanges: Array<Range<Decoration>>,
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
  child: SyntaxNodeRef["node"],
  markerLineStart: number,
  indentStyle: string,
  previousChildLineEnd: number,
  decorationRanges: Array<Range<Decoration>>,
  atomicRanges: Array<Range<Decoration>>,
) {
  addParagraphPrefixDecoration(
    state,
    child,
    markerLineStart,
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

  addListChildLineDecorations(
    state,
    child.from,
    child.to,
    markerLineStart,
    indentStyle,
    decorationRanges,
  );

  return state.doc.lineAt(child.to).to;
}

function buildListChildBlockDecorations(
  state: EditorState,
): [DecorationSet, DecorationSet] {
  const decorationRanges: Array<Range<Decoration>> = [];
  const atomicRanges: Array<Range<Decoration>> = [];

  syntaxTree(state).iterate({
    enter(node) {
      if (node.type.name !== "ListItem") {
        return;
      }

      const markerContext = getListItemMarkerContext(state, node);
      if (!markerContext) {
        return;
      }

      const { markerData, markerLineStart } = markerContext;
      const indentStyle = buildListChildIndentStyle(markerData.indentLevel);
      let previousChildLineEnd = state.doc.lineAt(markerData.markerEnd).to;

      for (let child = node.node.firstChild; child; child = child.nextSibling) {
        if (isListContainerNode(child)) {
          continue;
        }

        previousChildLineEnd = decorateListChildNode(
          state,
          child,
          markerLineStart,
          indentStyle,
          previousChildLineEnd,
          decorationRanges,
          atomicRanges,
        );
      }
    },
  });

  return [
    Decoration.set(decorationRanges, true),
    Decoration.set(atomicRanges, true),
  ];
}

function listChildBlocks(): Extension {
  return createListStateField(buildListChildBlockDecorations);
}

function taskListInteractions(): Extension {
  return [
    ViewPlugin.define(() => ({}), {
      eventHandlers: {
        mousedown(event) {
          const target = event.target as HTMLElement;
          const marker = target.closest(".cm-md-task-marker-source");
          if (!(marker instanceof HTMLElement) || event.button !== 0) {
            return false;
          }

          event.preventDefault();
          event.stopPropagation();
          return true;
        },
        click(event, view) {
          const target = event.target as HTMLElement;
          const marker = target.closest(".cm-md-task-marker-source");
          if (!(marker instanceof HTMLElement)) {
            return false;
          }

          event.preventDefault();
          event.stopPropagation();

          const from = view.posAtDOM(marker, 0);
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

        if (target.closest(".cm-md-task-marker-source")) {
          return false;
        }

        const marker = target.closest(
          ".cm-md-bullet-marker-source, .cm-md-number-marker-source",
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
    minWidth: "var(--cm-md-list-marker-width)",
    position: "relative",
    textAlign: "center",
    verticalAlign: "middle",
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
    fontSize: "1.35rem",
    justifyContent: "center",
    left: "50%",
    lineHeight: "1",
    pointerEvents: "none",
    position: "absolute",
    top: "50%",
    transform: "translate(-50%, -60%)",
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
    pointerEvents: "none",
    position: "absolute",
    top: "50%",
    transform: "translate(-50%, -50%)",
    WebkitTextFillColor: "var(--primary)",
  },
  ".cm-md-task-marker-source": {
    color: "transparent",
    cursor: "pointer",
    display: "inline-block",
    minWidth: "var(--cm-md-list-marker-width)",
    overflow: "hidden",
    textAlign: "justify",
    textAlignLast: "justify",
    textJustify: "inter-character",
    whiteSpace: "pre",
    width: "var(--cm-md-list-marker-width)",
    WebkitTextFillColor: "transparent",
  },
  ".cm-md-task-bullet-source": {
    color: "transparent",
    fontSize: "0",
    WebkitTextFillColor: "transparent",
  },
  ".cm-md-task-marker-source::before": {
    alignItems: "center",
    backgroundColor: "var(--background)",
    border: "1px solid var(--editor-checkbox-border)",
    borderRadius: "4px",
    boxSizing: "border-box",
    content: '""',
    display: "inline-flex",
    fontSize: "1rem",
    height: "1.15rem",
    justifyContent: "center",
    left: "50%",
    lineHeight: "1",
    pointerEvents: "none",
    position: "absolute",
    top: "50%",
    transform: "translate(-50%, -54%)",
    width: "1.15rem",
  },
  ".cm-md-task-marker-checked::before": {
    backgroundColor: "transparent",
    borderColor: "var(--muted-foreground)",
  },
  ".cm-md-task-marker-checked::after": {
    borderColor: "var(--muted-foreground)",
    borderStyle: "solid",
    borderWidth: "0 2px 2px 0",
    boxSizing: "border-box",
    content: '""',
    height: "0.68rem",
    left: "50%",
    pointerEvents: "none",
    position: "absolute",
    top: "50%",
    transform: "translate(-50%, -62%) rotate(45deg)",
    width: "0.4rem",
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
    { key: "ArrowLeft", run: (view) => moveAcrossListMarker("left", view) },
    { key: "ArrowRight", run: (view) => moveAcrossListMarker("right", view) },
  ]),
);

const listBreakKeymap = Prec.high(
  keymap.of([
    {
      key: "Shift-Enter",
      run: insertLineBreakWithoutListContinuation,
    },
  ]),
);

const listEditKeymap = keymap.of([
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
    : [taskListDecorations(), bulletLists(), numberLists(), listChildBlocks()];
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
