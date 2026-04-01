import { EditorSelection } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";

import type {
  BuilderContext,
  DecorationEntry,
} from "@/features/editor/extensions/markdown-decorations/types";

const TAB_SIZE = 2;

// ---------------------------------------------------------------------------
// Widgets
// ---------------------------------------------------------------------------

class SpacerWidget extends WidgetType {
  override eq(): boolean {
    return true;
  }

  override toDOM(): HTMLElement {
    const spacer = document.createElement("span");
    spacer.className = "cm-md-indent";
    return spacer;
  }
}

class BulletWidget extends WidgetType {
  override eq(): boolean {
    return true;
  }

  override toDOM(): HTMLElement {
    const wrapper = document.createElement("label");
    wrapper.className = "cm-md-list-marker";
    wrapper.setAttribute("aria-hidden", "true");
    wrapper.setAttribute("inert", "true");
    wrapper.innerHTML = "&bull;";
    return wrapper;
  }
}

class OrderedNumberWidget extends WidgetType {
  constructor(private readonly number: string) {
    super();
  }

  override eq(other: WidgetType): boolean {
    return other instanceof OrderedNumberWidget && other.number === this.number;
  }

  override toDOM(): HTMLElement {
    const wrapper = document.createElement("label");
    wrapper.className = "cm-md-list-marker";
    wrapper.setAttribute("aria-hidden", "true");
    wrapper.setAttribute("inert", "true");

    const content = document.createElement("span");
    content.className = "cm-md-number-marker";
    content.textContent = this.number;
    wrapper.append(content);

    return wrapper;
  }
}

class CheckboxWidget extends WidgetType {
  constructor(
    private readonly checked: boolean,
    private readonly from: number,
    private readonly to: number,
  ) {
    super();
  }

  override eq(other: WidgetType): boolean {
    return (
      other instanceof CheckboxWidget &&
      other.checked === this.checked &&
      other.from === this.from &&
      other.to === this.to
    );
  }

  override ignoreEvent(): boolean {
    return false;
  }

  override toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement("label");
    wrapper.className = "cm-md-list-marker cm-md-task";
    wrapper.setAttribute("aria-hidden", "true");

    const input = document.createElement("input");
    input.className = "cm-md-task-marker";
    input.type = "checkbox";
    input.checked = this.checked;
    input.setAttribute("tabindex", "-1");

    input.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const replacement = this.checked ? "[ ]" : "[x]";
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: replacement },
        selection: EditorSelection.cursor(this.from + replacement.length),
      });
    });

    wrapper.append(input);
    return wrapper;
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export function handleListMark(
  node: SyntaxNodeRef,
  ctx: BuilderContext,
  out: DecorationEntry[],
): void {
  const line = ctx.state.doc.lineAt(node.from);
  const charAfter = node.to < line.to ? line.text[node.to - line.from] : "";
  if (charAfter !== " ") {
    return;
  }

  const markerStart = node.from;
  const markerEnd = node.to;
  const textStart = markerEnd + 1;
  const marker = ctx.state.sliceDoc(markerStart, markerEnd).trim();
  const lineStart = line.from;
  const indentation = markerStart - lineStart;
  const indentLevel = Math.floor(indentation / TAB_SIZE);
  const parent = node.node.parent;
  const isOrdered = parent?.parent?.name === "OrderedList";

  // Check if this is a task list item
  const restOfLine = ctx.state.sliceDoc(
    textStart,
    Math.min(textStart + 4, line.to),
  );
  const isTaskItem = /^\[[ xX]\]/.test(restOfLine);

  // Line decoration with indent level
  let listClass = "cm-md-list";
  if (isTaskItem) {
    const isChecked =
      restOfLine.startsWith("[x]") || restOfLine.startsWith("[X]");
    listClass += isChecked
      ? " cm-md-task-list cm-md-task-checked"
      : " cm-md-task-list";
  } else {
    listClass += isOrdered ? " cm-md-number-list" : " cm-md-bullet-list";
  }

  out.push({
    from: lineStart,
    to: lineStart,
    decoration: Decoration.line({
      attributes: {
        class: listClass,
        style: `--indent-level: ${indentLevel}`,
      },
    }),
  });

  // Replace indentation spaces with spacer widgets
  for (let i = 0; i < indentLevel; i++) {
    const from = lineStart + i * TAB_SIZE;
    const to = from + TAB_SIZE;
    out.push({
      from,
      to,
      decoration: Decoration.replace({ widget: new SpacerWidget() }),
    });
  }

  if (isTaskItem) {
    // Replace "- [ ] " or "- [x] " with checkbox widget
    const taskEnd = textStart + 3;
    const taskText = ctx.state.sliceDoc(textStart, taskEnd);
    const checked = taskText === "[x]" || taskText === "[X]";
    const taskTextEnd =
      taskEnd < line.to && line.text[taskEnd - line.from] === " "
        ? taskEnd + 1
        : taskEnd;

    out.push({
      from: markerStart,
      to: taskTextEnd,
      decoration: Decoration.replace({
        widget: new CheckboxWidget(checked, textStart, taskEnd),
      }),
    });
  } else if (isOrdered) {
    const num = marker.replace(/\D/g, "") + ".";
    out.push({
      from: markerStart,
      to: textStart,
      decoration: Decoration.replace({
        widget: new OrderedNumberWidget(num),
      }),
    });
  } else {
    out.push({
      from: markerStart,
      to: textStart,
      decoration: Decoration.replace({
        widget: new BulletWidget(),
      }),
    });
  }
}
