import {
  EditorView,
  type PluginValue,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";

import { findEditorScrollContainer } from "@/features/editor/lib/view-utils";

type ScrollCenterOnEnterOptions = {
  viewportPercentage?: number;
};

type ScrollMeasure = {
  blockHeight: number;
  blockTop: number;
  containerHeight: number;
  scrollContainer: HTMLElement;
  scrollTop: number;
  targetScrollTop: number;
} | null;

function isCaretNearViewportBottom(
  view: EditorView,
  scrollContainer: HTMLElement,
  viewportPercentage: number,
): boolean {
  const caretRect = view.coordsAtPos(view.state.selection.main.head);
  if (!caretRect) {
    return false;
  }

  const containerRect = scrollContainer.getBoundingClientRect();
  const threshold = containerRect.height * (viewportPercentage / 100);
  return caretRect.bottom > containerRect.bottom - threshold;
}

function updateInsertedLineBreak(update: ViewUpdate): boolean {
  return update.transactions.some((transaction) => {
    if (!transaction.isUserEvent("input")) {
      return false;
    }

    let insertedLineBreak = false;
    transaction.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
      if (inserted.toString().includes("\n")) {
        insertedLineBreak = true;
      }
    });
    return insertedLineBreak;
  });
}

class ScrollCenterOnEnterPlugin implements PluginValue {
  constructor(
    private readonly view: EditorView,
    private readonly viewportPercentage: number,
  ) {}

  update(update: ViewUpdate): void {
    const insertedLineBreak =
      update.docChanged &&
      update.selectionSet &&
      updateInsertedLineBreak(update) &&
      update.state.selection.main.empty;

    if (!insertedLineBreak) {
      return;
    }

    this.view.requestMeasure<ScrollMeasure>({
      key: this,
      read: (view) => {
        const nextScrollContainer = findEditorScrollContainer(view);
        if (!nextScrollContainer) {
          return null;
        }

        const shouldCenter = isCaretNearViewportBottom(
          view,
          nextScrollContainer,
          this.viewportPercentage,
        );

        if (!shouldCenter) {
          return null;
        }

        const block = view.lineBlockAt(view.state.selection.main.head);
        const containerRect = nextScrollContainer.getBoundingClientRect();
        const blockMidpoint = view.documentTop + block.top + block.height / 2;
        const viewportMidpoint = containerRect.top + containerRect.height / 2;
        const targetScrollTop = Math.max(
          0,
          nextScrollContainer.scrollTop + (blockMidpoint - viewportMidpoint),
        );

        return {
          blockHeight: block.height,
          blockTop: block.top,
          containerHeight: containerRect.height,
          scrollContainer: nextScrollContainer,
          scrollTop: nextScrollContainer.scrollTop,
          targetScrollTop,
        };
      },
      write: (measure) => {
        if (!measure) {
          return;
        }

        measure.scrollContainer.scrollTop = measure.targetScrollTop;
      },
    });
  }
}

export function scrollCenterOnEnter({
  viewportPercentage = 1,
}: ScrollCenterOnEnterOptions = {}) {
  return ViewPlugin.fromClass(
    class extends ScrollCenterOnEnterPlugin {
      constructor(view: EditorView) {
        super(view, viewportPercentage);
      }
    },
  );
}
