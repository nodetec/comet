import { useEffect, useRef } from "react";
import {
  SearchQuery,
  closeSearchPanel,
  getSearchQuery,
  openSearchPanel,
  searchPanelOpen,
  setSearchQuery,
} from "@codemirror/search";
import {
  type Compartment,
  EditorSelection,
  type SelectionRange,
} from "@codemirror/state";
import { type EditorView } from "@codemirror/view";

import { buildSearchAwarePresentationExtensions } from "@/features/editor/lib/note-editor-config";
import {
  centerEditorPositionInView,
  countSearchMatches,
  findMatchAtIndex,
  revealEditorPositionIfNeeded,
} from "@/features/editor/lib/note-editor-search";
import { collectSearchMatches } from "@/shared/lib/search";

export interface UseNoteEditorSearchSyncParams {
  loadKey: string;
  markdown: string;
  noteId: string | null;
  onSearchMatchCountChangeRef: {
    current: ((count: number) => void) | undefined;
  };
  presentationCompartmentRef: { current: Compartment };
  searchActiveMatchIndex?: number | null;
  searchHighlightAllMatchesYellow?: boolean;
  searchQuery: string;
  searchScrollRevision?: number;
  viewRef: { current: EditorView | null };
}

export function useNoteEditorSearchSync({
  loadKey,
  markdown,
  noteId,
  onSearchMatchCountChangeRef,
  presentationCompartmentRef,
  searchActiveMatchIndex,
  searchHighlightAllMatchesYellow,
  searchQuery,
  searchScrollRevision,
  viewRef,
}: UseNoteEditorSearchSyncParams) {
  const previousActiveFindRef = useRef(
    searchQuery.trim().length > 0 && searchActiveMatchIndex != null,
  );
  const restoreSelectionRef = useRef<SelectionRange | null>(null);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    view.dispatch({
      effects: presentationCompartmentRef.current.reconfigure(
        buildSearchAwarePresentationExtensions(searchQuery, noteId),
      ),
    });
  }, [noteId, presentationCompartmentRef, searchQuery, viewRef]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    const isActiveFind =
      searchQuery.trim().length > 0 && searchActiveMatchIndex != null;

    if (
      !previousActiveFindRef.current &&
      isActiveFind &&
      restoreSelectionRef.current == null
    ) {
      restoreSelectionRef.current = view.state.selection.main;
    } else if (previousActiveFindRef.current && !isActiveFind) {
      const restoreSelection = restoreSelectionRef.current;
      restoreSelectionRef.current = null;

      if (restoreSelection) {
        view.dispatch({
          selection: EditorSelection.range(
            restoreSelection.anchor,
            restoreSelection.head,
          ),
          scrollIntoView: false,
        });
      } else {
        const cursor = view.state.selection.main.head;
        view.dispatch({
          selection: EditorSelection.cursor(cursor),
          scrollIntoView: false,
        });
      }
    }

    previousActiveFindRef.current = isActiveFind;
  }, [searchActiveMatchIndex, searchQuery, viewRef]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    const currentQuery = getSearchQuery(view.state);
    if (currentQuery.search === searchQuery) {
      return;
    }

    const activeElement = document.activeElement;
    if (searchQuery && !searchPanelOpen(view.state)) {
      openSearchPanel(view);
      if (activeElement instanceof HTMLElement) {
        activeElement.focus();
      }
    } else if (!searchQuery && searchPanelOpen(view.state)) {
      closeSearchPanel(view);
    }

    view.dispatch({
      effects: setSearchQuery.of(
        new SearchQuery({ search: searchQuery, literal: true }),
      ),
    });

    const query = getSearchQuery(view.state);
    onSearchMatchCountChangeRef.current?.(
      countSearchMatches(view.state, query),
    );
  }, [onSearchMatchCountChangeRef, searchQuery, viewRef]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !searchHighlightAllMatchesYellow || !searchQuery) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      const [firstMatch] = collectSearchMatches(
        view.state.doc.toString(),
        searchQuery,
      );
      if (!firstMatch) {
        return;
      }

      revealEditorPositionIfNeeded(view, firstMatch.from);
    });

    return () => cancelAnimationFrame(frame);
  }, [
    loadKey,
    markdown,
    searchHighlightAllMatchesYellow,
    searchQuery,
    viewRef,
  ]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    if (searchActiveMatchIndex == null || !searchQuery) {
      return;
    }

    const query = getSearchQuery(view.state);
    const match = findMatchAtIndex(view.state, query, searchActiveMatchIndex);
    if (match) {
      view.dispatch({
        selection: EditorSelection.range(match.from, match.to),
        scrollIntoView: false,
      });
      centerEditorPositionInView(view, match.from);
    }
  }, [searchActiveMatchIndex, searchQuery, searchScrollRevision, viewRef]);
}
