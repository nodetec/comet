import type { LoadedNote, NoteFilter } from "@/shared/api/types";
import type { DraftControl } from "@/features/shell/hooks/use-draft-control";
import { useShellStore } from "@/features/shell/store/use-shell-store";

export function matchesTagScope(tags: string[], tagPath: string) {
  return tags.some((tag) => tag === tagPath || tag.startsWith(`${tagPath}/`));
}

type CreateNoteMutation = {
  isPending: boolean;
  mutate: (input: {
    tags: string[];
    markdown: string;
    autoFocusEditor?: boolean;
  }) => void;
};

export interface ViewNavigationDeps {
  activeTagPath: string | null;
  tagViewActive: boolean;
  noteFilter: NoteFilter;
  effectiveNoteFilter: NoteFilter;
  selectedNoteId: string | null;
  currentNote: LoadedNote | undefined;
  isCreatingNote: boolean;
  draftControl: DraftControl;
  createNoteMutation: CreateNoteMutation;
  setActiveTagPath: (path: string | null) => void;
  setCreatingSelectedNoteId: (id: string | null) => void;
  setDraft: (noteId: string, markdown: string) => void;
  setFocusedPane: (pane: "sidebar" | "notes" | "editor") => void;
  setIsCreatingNoteTransition: (v: boolean) => void;
  setNoteFilter: (filter: NoteFilter) => void;
  setPendingAutoFocusEditorNoteId: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setSelectedNoteId: (id: string | null) => void;
  setTagViewActive: (active: boolean) => void;
}

export function useViewNavigation(deps: ViewNavigationDeps) {
  const {
    activeTagPath,
    tagViewActive,
    noteFilter,
    effectiveNoteFilter,
    selectedNoteId,
    currentNote,
    isCreatingNote,
    draftControl,
    createNoteMutation,
    setActiveTagPath,
    setCreatingSelectedNoteId,
    setDraft,
    setFocusedPane,
    setIsCreatingNoteTransition,
    setNoteFilter,
    setPendingAutoFocusEditorNoteId,
    setSearchQuery,
    setSelectedNoteId,
    setTagViewActive,
  } = deps;

  const { flushCurrentDraft, withFlushedCurrentDraft } = draftControl;

  const handleCreateNote = () => {
    if (isCreatingNote) {
      return;
    }

    flushCurrentDraft();
    const tagsForNewNote =
      tagViewActive && activeTagPath ? [activeTagPath] : [];
    if (
      !tagViewActive &&
      noteFilter !== "today" &&
      noteFilter !== "todo" &&
      noteFilter !== "pinned" &&
      noteFilter !== "untagged"
    ) {
      setNoteFilter("all");
    }
    setSearchQuery("");
    setCreatingSelectedNoteId(null);
    setIsCreatingNoteTransition(true);
    createNoteMutation.mutate({
      tags: tagsForNewNote,
      markdown: effectiveNoteFilter === "todo" ? "- [ ] " : "# ",
    });
  };

  const clearSelectionIfNotActive = () => {
    if (currentNote && (currentNote.archivedAt || currentNote.deletedAt)) {
      setSelectedNoteId(null);
      setDraft("", "");
    }
  };

  const handleSelectAll = () => {
    withFlushedCurrentDraft(() => {
      clearSelectionIfNotActive();
      setTagViewActive(false);
      setNoteFilter("all");
    });
  };

  const handleSelectToday = () => {
    withFlushedCurrentDraft(() => {
      clearSelectionIfNotActive();
      setTagViewActive(false);
      setNoteFilter("today");
    });
  };

  const handleSelectTodo = () => {
    withFlushedCurrentDraft(() => {
      clearSelectionIfNotActive();
      setTagViewActive(false);
      setNoteFilter("todo");
    });
  };

  const handleSelectPinned = () => {
    withFlushedCurrentDraft(() => {
      clearSelectionIfNotActive();
      setTagViewActive(false);
      setNoteFilter("pinned");
    });
  };

  const handleSelectUntagged = () => {
    withFlushedCurrentDraft(() => {
      clearSelectionIfNotActive();
      setTagViewActive(false);
      setNoteFilter("untagged");
    });
  };

  const handleSelectArchive = () => {
    withFlushedCurrentDraft(() => {
      setSelectedNoteId(null);
      setDraft("", "");
      setTagViewActive(false);
      setNoteFilter("archive");
    });
  };

  const handleSelectTrash = () => {
    withFlushedCurrentDraft(() => {
      setSelectedNoteId(null);
      setDraft("", "");
      setTagViewActive(false);
      setNoteFilter("trash");
    });
  };

  const handleSelectTagPath = (tagPath: string) => {
    if (tagViewActive && activeTagPath === tagPath) {
      return;
    }

    withFlushedCurrentDraft((savedNote) => {
      const noteForScope = savedNote ?? currentNote;

      if (noteForScope && !matchesTagScope(noteForScope.tags, tagPath)) {
        setSelectedNoteId(null);
        setDraft("", "");
      }

      setTagViewActive(true);
      setActiveTagPath(tagPath);
    });
  };

  const handleSelectNote = (noteId: string) => {
    if (noteId === selectedNoteId) {
      setFocusedPane("notes");
      return;
    }

    flushCurrentDraft();
    setCreatingSelectedNoteId(null);
    setPendingAutoFocusEditorNoteId(null);
    // Batch selectedNoteId + focusedPane into a single store update so
    // there's no intermediate render where the old note has the indicator.
    useShellStore.setState({ selectedNoteId: noteId, focusedPane: "notes" });
  };

  return {
    handleCreateNote,
    handleSelectAll,
    handleSelectToday,
    handleSelectTodo,
    handleSelectPinned,
    handleSelectUntagged,
    handleSelectArchive,
    handleSelectTrash,
    handleSelectTagPath,
    handleSelectNote,
  };
}
