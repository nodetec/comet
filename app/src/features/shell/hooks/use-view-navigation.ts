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
  } = deps;

  const { flushCurrentDraft, withFlushedCurrentDraft } = draftControl;
  const setNoteFilter = useShellStore((s) => s.setNoteFilter);
  const navigateToFilter = useShellStore((s) => s.navigateToFilter);
  const navigateToDisposedFilter = useShellStore(
    (s) => s.navigateToDisposedFilter,
  );
  const navigateToTagPath = useShellStore((s) => s.navigateToTagPath);
  const navigateToNote = useShellStore((s) => s.navigateToNote);
  const prepareNoteCreation = useShellStore((s) => s.prepareNoteCreation);

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
    prepareNoteCreation();
    createNoteMutation.mutate({
      tags: tagsForNewNote,
      markdown: effectiveNoteFilter === "todo" ? "- [ ] " : "# ",
    });
  };

  const handleSelectAll = () => {
    withFlushedCurrentDraft(() => navigateToFilter("all", currentNote));
  };

  const handleSelectToday = () => {
    withFlushedCurrentDraft(() => navigateToFilter("today", currentNote));
  };

  const handleSelectTodo = () => {
    withFlushedCurrentDraft(() => navigateToFilter("todo", currentNote));
  };

  const handleSelectPinned = () => {
    withFlushedCurrentDraft(() => navigateToFilter("pinned", currentNote));
  };

  const handleSelectUntagged = () => {
    withFlushedCurrentDraft(() => navigateToFilter("untagged", currentNote));
  };

  const handleSelectArchive = () => {
    withFlushedCurrentDraft(() => navigateToDisposedFilter("archive"));
  };

  const handleSelectTrash = () => {
    withFlushedCurrentDraft(() => navigateToDisposedFilter("trash"));
  };

  const handleSelectTagPath = (tagPath: string) => {
    if (tagViewActive && activeTagPath === tagPath) {
      return;
    }

    withFlushedCurrentDraft((savedNote) => {
      navigateToTagPath(tagPath, savedNote ?? currentNote);
    });
  };

  const handleSelectNote = (noteId: string) => {
    if (noteId === selectedNoteId) {
      useShellStore.setState({ focusedPane: "notes" });
      return;
    }

    flushCurrentDraft();
    navigateToNote(noteId);
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
