import { type EditorState } from "@codemirror/state";
import { type SearchQuery } from "@codemirror/search";
import { EditorView } from "@codemirror/view";

import { getEditorScrollContainer } from "@/features/editor/lib/view-utils";

export function centerEditorPositionInView(view: EditorView, position: number) {
  view.requestMeasure<{
    scrollContainer: HTMLElement;
    targetScrollTop: number;
  } | null>({
    key: `center-search-match-${position}`,
    read(view) {
      const scrollContainer = getEditorScrollContainer(view);
      const block = view.lineBlockAt(position);
      const containerRect = scrollContainer.getBoundingClientRect();
      const blockMidpoint = view.documentTop + block.top + block.height / 2;
      const viewportMidpoint = containerRect.top + containerRect.height / 2;
      const targetScrollTop = Math.max(
        0,
        scrollContainer.scrollTop + (blockMidpoint - viewportMidpoint),
      );

      return {
        scrollContainer,
        targetScrollTop,
      };
    },
    write(measure) {
      if (!measure) {
        return;
      }

      measure.scrollContainer.scrollTop = measure.targetScrollTop;
    },
  });
}

export function revealEditorPositionIfNeeded(
  view: EditorView,
  position: number,
) {
  view.requestMeasure<{
    scrollContainer: HTMLElement;
    targetScrollTop: number;
  } | null>({
    key: `reveal-search-match-${position}`,
    read(view) {
      const scrollContainer = getEditorScrollContainer(view);
      const positionRect =
        view.coordsAtPos(position, 1) ?? view.coordsAtPos(position, -1);
      const containerRect = scrollContainer.getBoundingClientRect();
      const isVisible = positionRect
        ? positionRect.bottom > containerRect.top &&
          positionRect.top < containerRect.bottom
        : false;

      if (isVisible) {
        return null;
      }

      const block = view.lineBlockAt(position);
      const blockMidpoint = view.documentTop + block.top + block.height / 2;
      const viewportMidpoint = containerRect.top + containerRect.height / 2;
      const targetScrollTop = Math.max(
        0,
        scrollContainer.scrollTop + (blockMidpoint - viewportMidpoint),
      );

      return {
        scrollContainer,
        targetScrollTop,
      };
    },
    write(measure) {
      if (!measure) {
        return;
      }

      measure.scrollContainer.scrollTop = measure.targetScrollTop;
    },
  });
}

export function countSearchMatches(state: EditorState, query: SearchQuery) {
  if (!query.valid) {
    return 0;
  }

  let count = 0;
  const cursor = query.getCursor(state);
  while (!cursor.next().done) {
    count++;
  }
  return count;
}

export function findMatchAtIndex(
  state: EditorState,
  query: SearchQuery,
  index: number,
): { from: number; to: number } | null {
  if (!query.valid || index < 0) {
    return null;
  }

  let currentIndex = 0;
  const cursor = query.getCursor(state);
  for (;;) {
    const next = cursor.next();
    if (next.done) {
      break;
    }

    const match = next.value;
    if (currentIndex === index) {
      return match;
    }
    currentIndex++;
  }

  return null;
}
