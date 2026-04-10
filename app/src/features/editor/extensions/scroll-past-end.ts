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
    this.spacer.addEventListener("mousedown", this.handleSpacerMouseDown);
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

  private handleSpacerMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    const anchor = this.view.state.doc.length;
    this.view.dispatch({
      selection: EditorSelection.cursor(anchor),
      scrollIntoView: false,
    });
    this.view.focus();

    const scrollContainer = findEditorScrollContainer(this.view);
    const scrollEdge = 30; // px from top/bottom edge to trigger scrolling
    const scrollSpeed = 8; // px per frame
    let scrollRAF = 0;

    const autoScroll = (clientY: number) => {
      cancelAnimationFrame(scrollRAF);
      if (!scrollContainer) {
        return;
      }

      const rect = scrollContainer.getBoundingClientRect();
      let delta = 0;
      if (clientY < rect.top + scrollEdge) {
        delta = -scrollSpeed;
      } else if (clientY > rect.bottom - scrollEdge) {
        delta = scrollSpeed;
      }

      if (delta === 0) {
        return;
      }

      const step = () => {
        scrollContainer.scrollTop += delta;
        scrollRAF = requestAnimationFrame(step);
      };
      scrollRAF = requestAnimationFrame(step);
    };

    const handleMouseMove = (e: MouseEvent) => {
      const pos = this.view.posAtCoords({ x: e.clientX, y: e.clientY });
      if (pos != null) {
        this.view.dispatch({
          selection: EditorSelection.range(anchor, pos),
          scrollIntoView: false,
        });
      }
      autoScroll(e.clientY);
    };

    const handleMouseUp = () => {
      cancelAnimationFrame(scrollRAF);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  destroy(): void {
    const scrollContainer = findEditorScrollContainer(this.view);
    scrollContainer?.classList.remove("hide-scrollbar");
    this.spacer?.removeEventListener("mousedown", this.handleSpacerMouseDown);
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
