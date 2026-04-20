import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { type NoteEditorHandle } from "@/features/editor/note-editor";
import { useCommandRequestId } from "@/shared/hooks/use-command-request";
import { useCommandStore } from "@/shared/stores/use-command-store";
import {
  isEditorFindShortcut,
  isNotesSearchShortcut,
} from "@/shared/lib/keyboard";
import { resolveActiveEditorSearch } from "@/shared/lib/search";

export function useFindBar({
  noteId,
  searchQuery,
  editorRef,
  setFocusedPane,
}: {
  noteId: string | null;
  searchQuery: string;
  editorRef: React.RefObject<NoteEditorHandle | null>;
  setFocusedPane: (pane: "sidebar" | "notes" | "editor") => void;
}) {
  const [findOpen, setFindOpen] = useState(false);
  const [findMatchCount, setFindMatchCount] = useState(0);
  const [findQuery, setFindQuery] = useState("");
  const [activeFindMatchIndex, setActiveFindMatchIndex] = useState(0);
  const [findScrollRevision, setFindScrollRevision] = useState(0);
  const editorFindRequestId = useCommandStore(
    (state) => state.editorFindRequestId,
  );
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const lastActiveNoteIdRef = useRef(noteId);
  const hasEditorFindQuery = findOpen && findQuery.trim().length > 0;

  const activeEditorSearch = resolveActiveEditorSearch({
    editorQuery: hasEditorFindQuery ? findQuery : "",
    noteQuery: searchQuery,
  });
  const editorSearchQuery = activeEditorSearch.query;
  const isUsingEditorFindSearch = activeEditorSearch.source === "editor";
  const activeEditorFindMatchCount = isUsingEditorFindSearch
    ? findMatchCount
    : 0;
  const resolvedActiveFindMatchIndex =
    activeEditorFindMatchCount === 0
      ? 0
      : Math.min(activeFindMatchIndex, activeEditorFindMatchCount - 1);

  if (lastActiveNoteIdRef.current !== noteId) {
    lastActiveNoteIdRef.current = noteId;
    if (activeFindMatchIndex !== 0) {
      setActiveFindMatchIndex(0);
    }
  }

  const closeFind = (focusEditor: boolean) => {
    setFocusedPane("editor");
    setFindOpen(false);
    setFindMatchCount(0);
    setFindQuery("");
    setActiveFindMatchIndex(0);
    if (focusEditor) {
      requestAnimationFrame(() => {
        editorRef.current?.focus();
      });
    }
  };

  const focusFindInput = () => {
    requestAnimationFrame(() => {
      findInputRef.current?.focus();
      findInputRef.current?.select();
    });
  };

  const openFind = () => {
    setFocusedPane("editor");
    setFindOpen(true);

    if (findOpen) {
      focusFindInput();
    }
  };

  const stepActiveFindMatch = (direction: 1 | -1) => {
    if (activeEditorFindMatchCount === 0) return;
    setActiveFindMatchIndex((prev) => {
      const current =
        activeEditorFindMatchCount === 0
          ? 0
          : Math.min(prev, activeEditorFindMatchCount - 1);
      const next = current + direction;
      if (next < 0) return activeEditorFindMatchCount - 1;
      if (next >= activeEditorFindMatchCount) return 0;
      return next;
    });
    setFindScrollRevision((r) => r + 1);
  };

  const ensureActiveFindMatch = () => {
    if (activeEditorFindMatchCount === 0 || findQuery.trim().length === 0) {
      return;
    }

    setFindScrollRevision((value) => value + 1);
  };

  useLayoutEffect(() => {
    if (!findOpen || !noteId) {
      return;
    }

    focusFindInput();
  }, [findOpen, focusFindInput, noteId]);

  const handleGlobalFindKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented) {
      return;
    }

    if (isNotesSearchShortcut(event)) {
      return;
    }

    if (isEditorFindShortcut(event)) {
      event.preventDefault();
      openFind();
    }
    if (event.key === "Escape" && findOpen) {
      event.preventDefault();
      closeFind(true);
    }
  });

  useEffect(() => {
    window.addEventListener("keydown", handleGlobalFindKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGlobalFindKeyDown);
    };
  }, []);

  useCommandRequestId(editorFindRequestId, () => {
    openFind();
  });

  return {
    findOpen,
    findMatchCount: activeEditorFindMatchCount,
    findQuery,
    activeFindMatchIndex: resolvedActiveFindMatchIndex,
    findScrollRevision,
    findInputRef,
    editorSearchQuery,
    isUsingEditorFindSearch,
    setFindMatchCount,
    setFindQuery,
    setActiveFindMatchIndex,
    closeFind,
    ensureActiveFindMatch,
    stepActiveFindMatch,
  };
}
