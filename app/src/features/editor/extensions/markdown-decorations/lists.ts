import { indentLess, indentMore } from "@codemirror/commands";
import { syntaxTree } from "@codemirror/language";
import {
  EditorSelection,
  EditorState,
  StateField,
  type Extension,
  type Range,
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

const TAB_SIZE = 2;
const BULLET_MARKERS = new Set(["-", "*", "+"]);
const INDENT = "  ";
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

  const indentLevel = Math.floor((from - line.from) / TAB_SIZE);
  const spacerDecorations: Array<Range<Decoration>> = [];

  for (const index of Array.from(
    { length: indentLevel },
    (_, value) => value,
  )) {
    const spacerFrom = line.from + index * TAB_SIZE;
    const spacerTo = spacerFrom + TAB_SIZE;
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

  view.dispatch({
    changes: { from: line.from, insert: INDENT },
    selection: EditorSelection.cursor(selection.head + INDENT.length),
  });

  const nextLine = view.state.doc.lineAt(selection.head + INDENT.length);
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

  let removableIndent = 0;
  if (line.text.startsWith(INDENT)) {
    removableIndent = INDENT.length;
  } else if (line.text.startsWith(" ")) {
    removableIndent = 1;
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

function getCursorBoundary(
  position: number,
  assoc: -1 | 0 | 1,
  marker: MarkerRange,
) {
  if (position === marker.from) {
    return { assoc: -1 as const, position: marker.from };
  }

  if (position === marker.to) {
    return { assoc: 1 as const, position: marker.to };
  }

  if (position <= marker.from || position >= marker.to) {
    return null;
  }

  const midpoint = marker.from + (marker.to - marker.from) / 2;
  if (assoc < 0 || (assoc === 0 && position <= midpoint)) {
    return { assoc: -1 as const, position: marker.from };
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
    if (
      direction === "left" &&
      selection.head === marker.to &&
      selection.assoc === 1
    ) {
      view.dispatch({
        selection: EditorSelection.cursor(marker.from, -1),
      });
      return true;
    }

    if (
      direction === "right" &&
      selection.head === marker.from &&
      selection.assoc === -1
    ) {
      view.dispatch({
        selection: EditorSelection.cursor(marker.to, 1),
      });
      return true;
    }
  }

  return false;
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

  syntaxTree(state).iterate({
    enter(node) {
      if (node.type.name === "Blockquote") {
        return false;
      }

      const data = getListMarkerData(state, node);
      if (!data || BULLET_MARKERS.has(data.marker)) {
        return;
      }

      addListDecorations(
        data,
        "cm-md-list cm-md-number-list",
        Decoration.mark({
          class: "cm-md-list-marker cm-md-number-marker",
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
      addListDecorations(
        data,
        `cm-md-list cm-md-task-list ${checked ? "cm-md-task-checked" : "cm-md-task-unchecked"}`,
        Decoration.mark({
          class: `cm-md-list-marker cm-md-task-marker-source ${checked ? "cm-md-task-marker-checked" : "cm-md-task-marker-unchecked"}`,
        }).range(data.markerStart, taskEnd + 1),
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

          const position = view.posAtDOM(marker, 0);
          const from = position + 2;
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

const listTheme = EditorView.theme({
  ".cm-md-indent": {
    display: "inline-flex",
  },
  ".cm-md-list": {
    paddingLeft: "calc(var(--indent-level) * 2rem + 2rem) !important",
    position: "relative",
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
  },
  ".cm-md-bullet-marker-source": {
    color: "transparent",
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
  ".cm-md-number-marker": {
    color: "var(--primary)",
    fontVariantNumeric: "tabular-nums",
    WebkitTextFillColor: "var(--primary)",
  },
  ".cm-md-task-marker-source": {
    color: "transparent",
    cursor: "pointer",
    WebkitTextFillColor: "transparent",
  },
  ".cm-md-task-marker-source::before": {
    alignItems: "center",
    backgroundColor: "var(--background)",
    border: "1px solid var(--primary)",
    borderRadius: "4px",
    boxSizing: "border-box",
    content: '""',
    display: "inline-flex",
    height: "1rem",
    justifyContent: "center",
    left: "50%",
    pointerEvents: "none",
    position: "absolute",
    top: "50%",
    transform: "translate(-50%, -54%)",
    width: "1rem",
  },
  ".cm-md-task-marker-checked::before": {
    backgroundColor: "var(--primary)",
  },
  ".cm-md-task-marker-checked::after": {
    borderColor: "var(--primary-foreground)",
    borderStyle: "solid",
    borderWidth: "0 2px 2px 0",
    boxSizing: "border-box",
    content: '""',
    height: "0.6rem",
    left: "50%",
    pointerEvents: "none",
    position: "absolute",
    top: "50%",
    transform: "translate(-50%, -56%) rotate(45deg)",
    width: "0.35rem",
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

const listKeymap = keymap.of([
  { key: "ArrowLeft", run: (view) => moveAcrossListMarker("left", view) },
  { key: "ArrowRight", run: (view) => moveAcrossListMarker("right", view) },
  { key: "Tab", run: indentListItemPreservingWrappedStart },
  { key: "Shift-Tab", run: dedentListItemPreservingWrappedStart },
]);

export function lists(): Extension {
  return [
    EditorState.transactionFilter.of((transaction) => {
      const selection = normalizeSelectionToListMarkers(transaction.state);
      return selection
        ? [transaction, { selection, sequential: true }]
        : [transaction];
    }),
    taskLists(),
    bulletLists(),
    numberLists(),
    listTheme,
    listKeymap,
  ];
}
