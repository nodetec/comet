import { EditorSelection } from "@codemirror/state";
import {
  EditorView,
  type PluginValue,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";

import { findEditorScrollContainer } from "@/features/editor/lib/view-utils";

type ScrollPastEndOptions = {
  /** Content-to-viewport ratio at which padding begins (default: 0.5 = 50%). */
  startRatio?: number;
  /** Step size: padding increases every this fraction of growth (default: 0.05 = 5%). */
  step?: number;
  /** Maximum padding as a fraction of viewport height (default: 0.7 = 70%). */
  maxPaddingRatio?: number;
};

class ScrollPastEndPlugin implements PluginValue {
  private currentHeight = 0;
  private spacer: HTMLDivElement | null = null;

  constructor(
    private readonly view: EditorView,
    private readonly startRatio: number,
    private readonly step: number,
    private readonly maxPaddingRatio: number,
  ) {
    this.measure();
  }

  update(update: ViewUpdate): void {
    if (update.geometryChanged || update.docChanged) {
      this.measure();
    }
  }

  private ensureSpacer(): HTMLDivElement | null {
    if (this.spacer) {
      return this.spacer;
    }

    const scrollContainer = findEditorScrollContainer(this.view);
    if (!scrollContainer) {
      return null;
    }

    this.spacer = document.createElement("div");
    this.spacer.setAttribute("aria-hidden", "true");
    this.spacer.style.cursor = "text";
    this.spacer.addEventListener("mousedown", this.handleSpacerClick);
    scrollContainer.append(this.spacer);
    return this.spacer;
  }

  private measure(): void {
    const scrollContainer = findEditorScrollContainer(this.view);
    if (!scrollContainer) {
      return;
    }

    const viewportHeight = scrollContainer.clientHeight;
    if (viewportHeight === 0) {
      return;
    }

    const contentHeight = this.view.contentHeight;
    const ratio = contentHeight / viewportHeight;

    let height = 0;
    if (ratio > this.startRatio) {
      const excess = ratio - this.startRatio;
      const steps = Math.floor(excess / this.step);
      const maxHeight = viewportHeight * this.maxPaddingRatio;
      height = Math.min(steps * (maxHeight / 20), maxHeight);
    }

    // Always keep at least 1px so the scroll container has overflow
    // and macOS rubber-band bounce works even with short content.
    height = Math.max(height, 1);

    if (height !== this.currentHeight) {
      this.currentHeight = height;
      const spacer = this.ensureSpacer();
      if (spacer) {
        spacer.style.height = `${height}px`;
      }

      // Hide scrollbar when overflow is just the 1px bounce pixel.
      scrollContainer.classList.toggle("hide-scrollbar", height <= 1);
    }
  }

  private handleSpacerClick = (event: MouseEvent): void => {
    event.preventDefault();
    this.view.dispatch({
      selection: EditorSelection.cursor(this.view.state.doc.length),
      scrollIntoView: false,
    });
    this.view.focus();
  };

  destroy(): void {
    const scrollContainer = findEditorScrollContainer(this.view);
    scrollContainer?.classList.remove("hide-scrollbar");
    this.spacer?.removeEventListener("mousedown", this.handleSpacerClick);
    this.spacer?.remove();
    this.spacer = null;
  }
}

export function scrollPastEnd({
  startRatio = 0.3,
  step = 0.05,
  maxPaddingRatio = 0.7,
}: ScrollPastEndOptions = {}) {
  return ViewPlugin.fromClass(
    class extends ScrollPastEndPlugin {
      constructor(view: EditorView) {
        super(view, startRatio, step, maxPaddingRatio);
      }
    },
  );
}
