import { EditorSelection } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";

import type {
  BuilderContext,
  DecorationEntry,
} from "@/features/editor/extensions/markdown-decorations/types";

// ---------------------------------------------------------------------------
// Widgets
// ---------------------------------------------------------------------------

class BulletWidget extends WidgetType {
  override eq(): boolean {
    return true;
  }

  override toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-md-bullet";
    span.textContent = "•";
    return span;
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
    const span = document.createElement("span");
    span.className = "cm-md-ordered-num";
    span.textContent = this.number;
    return span;
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
    const span = document.createElement("span");
    span.className = this.checked
      ? "cm-md-checkbox cm-md-checkbox-checked"
      : "cm-md-checkbox";

    span.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const replacement = this.checked ? "[ ]" : "[x]";
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: replacement },
        selection: EditorSelection.cursor(this.from + replacement.length),
      });
    });

    return span;
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

const taskCheckedLine = Decoration.line({ class: "cm-md-task-checked" });

export function handleListMark(
  node: SyntaxNodeRef,
  ctx: BuilderContext,
  out: DecorationEntry[],
): void {
  // Only decorate when there's a space after the marker (fully formed list item)
  const line = ctx.state.doc.lineAt(node.from);
  const charAfter = node.to < line.to ? line.text[node.to - line.from] : "";
  if (charAfter !== " ") {
    return;
  }

  // Include the trailing space in the replacement range
  const replaceEnd = node.to + 1;
  const text = ctx.state.sliceDoc(node.from, node.to).trim();
  const parent = node.node.parent;
  const isOrdered = parent?.parent?.name === "OrderedList";

  // Check if this is a task list item by looking at the text after the mark
  // (e.g. "- [ ] task" or "- [x] task")
  const afterSpace = replaceEnd;
  const restOfLine = ctx.state.sliceDoc(
    afterSpace,
    Math.min(afterSpace + 4, line.to),
  );
  const isTaskItem = /^\[[ xX]\]/.test(restOfLine);
  if (isTaskItem) {
    out.push({
      from: node.from,
      to: replaceEnd,
      decoration: Decoration.replace({}),
    });
    return;
  }

  if (isOrdered) {
    const num = text.replace(/\D/g, "") + ".";
    out.push({
      from: node.from,
      to: replaceEnd,
      decoration: Decoration.replace({
        widget: new OrderedNumberWidget(num),
      }),
    });
  } else {
    out.push({
      from: node.from,
      to: replaceEnd,
      decoration: Decoration.replace({
        widget: new BulletWidget(),
      }),
    });
  }
}

export function handleTaskMarker(
  node: SyntaxNodeRef,
  ctx: BuilderContext,
  out: DecorationEntry[],
): void {
  const text = ctx.state.sliceDoc(node.from, node.to);
  const checked = text === "[x]" || text === "[X]";

  // Replace [ ]/[x] with an interactive checkbox widget
  // Include the trailing space in the replacement if present
  const afterMarker = node.to;
  const line = ctx.state.doc.lineAt(node.from);
  const endOfReplace =
    afterMarker < line.to && line.text[afterMarker - line.from] === " "
      ? afterMarker + 1
      : afterMarker;

  out.push({
    from: node.from,
    to: endOfReplace,
    decoration: Decoration.replace({
      widget: new CheckboxWidget(checked, node.from, node.to),
    }),
  });

  // Add line decoration for checked items (muted + strikethrough)
  if (checked) {
    out.push({
      from: line.from,
      to: line.from,
      decoration: taskCheckedLine,
    });
  }
}
