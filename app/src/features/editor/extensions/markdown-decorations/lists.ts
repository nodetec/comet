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
  WidgetType,
  type DecorationSet,
} from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";

const BULLET_INDENT = 2;
const ORDERED_INDENT = 3;
const BULLET_MARKERS = new Set(["-", "*", "+"]);
const LIST_PREFIX_RE = /^(\s*)([-*+]|\d+[.)]) (\[[ xX]\] )?/;
const TASK_MARKERS = new Set(["[ ]", "[x]"]);

type ListMarkerData = {
  indentLevel: number;
  lineStart: number;
  marker: string;
  markerEnd: number;
  markerStart: number;
  spacerDecorations: Array<Range<Decoration>>;
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

class SpacerWidget extends WidgetType {
  override toDOM(): HTMLElement {
    const spacer = document.createElement("span");
    spacer.className = "cm-md-indent";
    spacer.style.display = "inline-flex";
    spacer.style.inlineSize = "2rem";
    return spacer;
  }
}

export function getListMarkerData(
  state: EditorState,
  { from, to, type }: SyntaxNodeRef,
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

  const tabSize = BULLET_MARKERS.has(marker) ? BULLET_INDENT : ORDERED_INDENT;
  const indentChars = from - line.from;
  const indentLevel = Math.floor(indentChars / tabSize);
  const spacerDecorations: Array<Range<Decoration>> = [];

  for (let i = 0; i < indentLevel; i++) {
    const spacerFrom = line.from + i * tabSize;
    const spacerTo = spacerFrom + tabSize;
    spacerDecorations.push(
      Decoration.replace({ widget: new SpacerWidget() }).range(
        spacerFrom,
        spacerTo,
      ),
    );
  }

  return {
    indentLevel,
    lineStart: line.from,
    marker,
    markerEnd: to,
    markerStart: from,
    spacerDecorations,
  };
}

function createListStateField(
  decorate: (state: EditorState) => [DecorationSet, DecorationSet],
) {
  return StateField.define<[DecorationSet, DecorationSet]>({
    create(state) {
      return decorate(state);
    },
    update(_value, transaction) {
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
  atomicRanges: Array<Range<Decoration>>,
) {
  decorationRanges.push(
    Decoration.line({
      attributes: {
        class: lineClass,
        style: `--indent-level: ${data.indentLevel}`,
      },
    }).range(data.lineStart),
    ...data.spacerDecorations,
    markerDecoration,
  );
  atomicRanges.push(...data.spacerDecorations);
}

function getListTextStart(lineText: string, lineFrom: number, lineTo: number) {
  const match = LIST_PREFIX_RE.exec(lineText);
  return Math.min(lineTo, lineFrom + (match?.[0].length ?? 0));
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

  let changeFrom = 0;
  let changeTo = 0;
  let insertedText = "";
  let found = false;

  transaction.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    const text = inserted.toString();
    if (/\n\s*\n/.test(text)) {
      found = true;
      changeFrom = fromA;
      changeTo = toA;
      insertedText = text;
    }
  });

  if (!found) {
    return null;
  }

  const fixedText = insertedText.replace(/\n\s*\n/, "\n");
  const charsRemoved = insertedText.length - fixedText.length;
  const originalCursor = transaction.newSelection.main.head;

  return {
    changes: { from: changeFrom, to: changeTo, insert: fixedText },
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
      if (node.type.name === "Blockquote") {
        return false;
      }

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

  // Track display number per indent level across the whole document.
  // Reset when indent decreases or a non-list gap appears.
  const counterByIndent = new Map<number, number>();
  let prevIndent = -1;

  syntaxTree(state).iterate({
    enter(node) {
      if (node.type.name === "Blockquote") {
        return false;
      }

      const data = getListMarkerData(state, node);
      if (!data || BULLET_MARKERS.has(data.marker)) {
        return;
      }

      const indent = data.indentLevel;

      // Reset deeper counters when returning to shallower indent
      if (prevIndent >= 0 && indent < prevIndent) {
        for (const [key] of counterByIndent) {
          if (key > indent) {
            counterByIndent.delete(key);
          }
        }
      }

      const displayNumber = (counterByIndent.get(indent) ?? 0) + 1;
      counterByIndent.set(indent, displayNumber);
      prevIndent = indent;

      // Extract the separator (. or )) from the marker text
      const sep = data.marker.replace(/^\d+/, "");

      addListDecorations(
        data,
        "cm-md-list cm-md-number-list",
        Decoration.mark({
          class: "cm-md-list-marker cm-md-number-marker-source",
          attributes: {
            style: `--display-number: "${displayNumber}${sep} "`,
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
      if (node.type.name === "Blockquote") {
        return false;
      }

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
      decorationRanges.push(
        Decoration.line({
          attributes: {
            class: `cm-md-list cm-md-task-list ${checked ? "cm-md-task-checked" : "cm-md-task-unchecked"}`,
            style: `--indent-level: ${data.indentLevel}`,
          },
        }).range(data.lineStart),
        ...data.spacerDecorations,
        Decoration.mark({
          class: "cm-md-task-bullet-source",
        }).range(data.markerStart, data.markerEnd + 1),
        Decoration.mark({
          class: `cm-md-list-marker cm-md-task-marker-source ${checked ? "cm-md-task-marker-checked" : "cm-md-task-marker-unchecked"}`,
        }).range(taskStart, taskEnd + 1),
      );
      atomicRanges.push(...data.spacerDecorations);
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

function taskLists(): Extension {
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
    createListStateField(buildTaskListDecorations),
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
  ".cm-md-indent": {
    display: "inline-flex",
  },
  ".cm-md-list": {
    paddingLeft: "calc(var(--indent-level) * 2rem + 2rem) !important",
    textIndent: "calc((var(--indent-level) * 2rem + 2rem) * -1)",
  },
  ".cm-md-list *": {
    textIndent: "0",
  },
  ".cm-md-list-marker": {
    alignItems: "center",
    color: "var(--primary)",
    display: "inline-flex",
    justifyContent: "center",
    minWidth: "2rem",
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
    width: "2rem",
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
    width: "2rem",
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
    minWidth: "2rem",
    overflow: "hidden",
    textAlign: "justify",
    textAlignLast: "justify",
    textJustify: "inter-character",
    whiteSpace: "pre",
    width: "2rem",
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

const listEditKeymap = keymap.of([
  { key: "Tab", run: indentListItemPreservingWrappedStart },
  { key: "Shift-Tab", run: dedentListItemPreservingWrappedStart },
]);

export function lists(): Extension {
  return [
    EditorState.transactionFilter.of(
      (transaction): readonly TransactionSpec[] => {
        const tightContinuation = stripNonTightListContinuation(transaction);
        if (tightContinuation) {
          return [tightContinuation as TransactionSpec];
        }

        const listPrefixRemoval = backspaceRemoveListPrefix(transaction);
        if (listPrefixRemoval) {
          return [listPrefixRemoval as TransactionSpec];
        }

        const selection = normalizeSelectionToListMarkers(transaction.state);
        return selection
          ? [transaction, { selection, sequential: true }]
          : [transaction];
      },
    ),
    taskLists(),
    listMarkerInteractions(),
    bulletLists(),
    numberLists(),
    listInputHandler,
    listTheme,
    listNavigationKeymap,
    listEditKeymap,
  ];
}
