import { WidgetType } from "@codemirror/view";

export class TaskMarkerWidget extends WidgetType {
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

export class EmptyTaskPlaceholderWidget extends WidgetType {
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
