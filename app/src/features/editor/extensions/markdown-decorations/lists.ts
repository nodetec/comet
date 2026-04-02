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
const BULLET_MARKERS = new Set(["-", "*"]);
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
    spacer.style.textDecoration = "none";

    const marker = document.createElement("span");
    marker.className = "cm-md-indent-marker";
    marker.innerHTML = "&nbsp;";

    spacer.append(marker);
    return spacer;
  }
}

abstract class MarkerWidget extends WidgetType {
  override coordsAt(dom: HTMLElement, _pos: number, side: number) {
    const rect = dom.getBoundingClientRect();
    const x = side < 0 ? rect.left : rect.right;

    return {
      bottom: rect.bottom,
      left: x,
      right: x,
      top: rect.top,
    };
  }
}

class TaskWidget extends MarkerWidget {
  constructor(private readonly checked: boolean) {
    super();
  }

  override eq(other: WidgetType): boolean {
    return other instanceof TaskWidget && other.checked === this.checked;
  }

  override ignoreEvent(): boolean {
    return false;
  }

  override toDOM(): HTMLElement {
    const wrapper = createMarkerWrapper();
    const input = document.createElement("input");

    input.setAttribute("aria-hidden", "true");
    input.setAttribute("tabindex", "-1");
    input.className = "cm-md-task-marker";
    input.type = "checkbox";
    input.checked = this.checked;

    wrapper.classList.add("cm-md-task");
    wrapper.append(input);

    return wrapper;
  }
}

class BulletWidget extends MarkerWidget {
  override toDOM(): HTMLElement {
    const wrapper = createMarkerWrapper();
    wrapper.setAttribute("inert", "true");
    wrapper.innerHTML = "&bull;";
    return wrapper;
  }
}

class NumberWidget extends MarkerWidget {
  constructor(private readonly marker: string) {
    super();
  }

  override eq(other: WidgetType): boolean {
    return other instanceof NumberWidget && other.marker === this.marker;
  }

  override toDOM(): HTMLElement {
    const wrapper = createMarkerWrapper();
    const content = document.createElement("span");

    wrapper.setAttribute("inert", "true");
    content.setAttribute("aria-hidden", "true");
    content.setAttribute("tabindex", "-1");
    content.className = "cm-md-number-marker";
    content.innerHTML = this.marker;

    wrapper.append(content);
    return wrapper;
  }
}

function createMarkerWrapper(): HTMLElement {
  const wrapper = document.createElement("label");
  wrapper.setAttribute("aria-hidden", "true");
  wrapper.setAttribute("tabindex", "-1");
  wrapper.className = "cm-md-list-marker";
  wrapper.style.minWidth = "2rem";
  return wrapper;
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
  atomicRanges.push(...data.spacerDecorations, markerDecoration);
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

      addListDecorations(
        data,
        "cm-md-list cm-md-bullet-list",
        Decoration.replace({ widget: new BulletWidget() }).range(
          data.markerStart,
          data.markerEnd + 1,
        ),
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
        Decoration.replace({ widget: new NumberWidget(data.marker) }).range(
          data.markerStart,
          data.markerEnd + 1,
        ),
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
        Decoration.replace({ widget: new TaskWidget(checked) }).range(
          data.markerStart,
          taskEnd + 1,
        ),
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
        mousedown(event, view) {
          const target = event.target as HTMLElement;
          const checkbox = target
            .closest(".cm-md-list-marker")
            ?.querySelector(".cm-md-task-marker");

          if (!(checkbox instanceof HTMLElement)) {
            return false;
          }

          const position = view.posAtDOM(checkbox);
          const from = position - 4;
          const to = position - 1;
          const marker = view.state.sliceDoc(from, to);

          if (marker === "[ ]" || marker === "[x]") {
            view.dispatch({
              changes: {
                from,
                to,
                insert: marker === "[ ]" ? "[x]" : "[ ]",
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
    justifyContent: "center",
  },
  ".cm-md-indent-marker": {
    borderLeft: "1px solid var(--muted-foreground)",
    bottom: "0",
    overflow: "hidden",
    position: "absolute",
    top: "0",
    width: "0",
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
    color: "var(--muted-foreground)",
    display: "inline-flex",
    justifyContent: "center",
    minWidth: "2rem",
  },
  ".cm-md-task-marker": {
    cursor: "pointer",
    margin: "0",
    scale: "1.2",
    transformOrigin: "center center",
  },
  ".cm-md-task-list.cm-md-task-checked": {
    textDecoration: "line-through",
    textDecorationColor: "var(--muted-foreground)",
  },
});

const listKeymap = keymap.of([
  { key: "Tab", run: indentMore },
  { key: "Shift-Tab", run: indentLess },
]);

export function lists(): Extension {
  return [
    EditorState.transactionFilter.of((transaction) => {
      const selection = normalizeSelectionToListMarkers(transaction.state);
      return selection ? [transaction, { selection }] : [transaction];
    }),
    taskLists(),
    bulletLists(),
    numberLists(),
    listTheme,
    listKeymap,
  ];
}
