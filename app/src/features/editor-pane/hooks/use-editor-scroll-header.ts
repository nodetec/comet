import { useLayoutEffect, useRef, useState } from "react";

export function useEditorScrollHeader(
  noteId: string | null,
  scrollContainerRef: React.RefObject<HTMLDivElement | null>,
) {
  const [showHeaderBorder, setShowHeaderBorder] = useState(false);
  const [showHeaderTitle, setShowHeaderTitle] = useState(false);
  const noteScrollPositionsRef = useRef(new Map());

  const updateHeaderState = (scrollContainer: HTMLDivElement | null) => {
    const scrolled = (scrollContainer?.scrollTop ?? 0) > 0;
    setShowHeaderBorder(scrolled);

    if (!scrollContainer || !noteId) {
      setShowHeaderTitle(false);
      return;
    }

    const firstLine = scrollContainer.querySelector(
      ".cm-content > .cm-line:first-child",
    ) as HTMLElement | null;

    if (!firstLine) {
      setShowHeaderTitle(scrolled);
      return;
    }

    const scrollRect = scrollContainer.getBoundingClientRect();
    const firstLineRect = firstLine.getBoundingClientRect();
    setShowHeaderTitle(firstLineRect.bottom <= scrollRect.top);
  };

  useLayoutEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) {
      updateHeaderState(null);
      return;
    }

    const nextScrollTop = noteId
      ? (noteScrollPositionsRef.current.get(noteId) ?? 0)
      : 0;
    scrollContainer.scrollTop = nextScrollTop;
    setShowHeaderBorder(nextScrollTop > 0);

    const frame = window.requestAnimationFrame(() => {
      updateHeaderState(scrollContainer);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [noteId, scrollContainerRef, updateHeaderState]);

  const scrollContainerCallbacks = {
    onScroll: (noteId: string | null, scrollTop: number) => {
      if (noteId) {
        noteScrollPositionsRef.current.set(noteId, scrollTop);
      }
    },
    updateHeaderState,
  };

  return { showHeaderBorder, showHeaderTitle, scrollContainerCallbacks };
}
