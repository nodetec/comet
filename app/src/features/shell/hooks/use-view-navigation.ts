import { type QueryClient } from "@tanstack/react-query";
import type { LoadedNote } from "@/shared/api/types";
import type { DraftControl } from "@/features/shell/hooks/use-draft-control";
import { useShellNavigationStore } from "@/features/shell/store/use-shell-navigation-store";

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
  queryClient: QueryClient;
  draftControl: DraftControl;
  createNoteMutation: CreateNoteMutation;
}

export function useViewNavigation(deps: ViewNavigationDeps) {
  const { draftControl, createNoteMutation, queryClient } = deps;
  const {
    navigateToFilter,
    navigateToDisposedFilter,
    navigateToTagPath,
    navigateToNote,
    prepareNoteCreation,
    setFocusedPane,
    setNoteFilter,
  } = useShellNavigationStore((state) => state.actions);

  const { flushCurrentDraft, withFlushedCurrentDraft } = draftControl;
  const createNotePending = createNoteMutation.isPending;
  const mutateCreateNote = createNoteMutation.mutate;

  const getCurrentNote = (): LoadedNote | undefined => {
    const { selectedNoteId } = useShellNavigationStore.getState();
    if (!selectedNoteId) {
      return undefined;
    }

    return queryClient.getQueryData<LoadedNote>(["note", selectedNoteId]);
  };

  const handleCreateNote = () => {
    const {
      activeTagPath,
      isCreatingNoteTransition,
      noteFilter,
      tagViewActive,
    } = useShellNavigationStore.getState();
    const isCreatingNote = isCreatingNoteTransition || createNotePending;
    if (isCreatingNote) {
      return;
    }

    flushCurrentDraft();
    const tagsForNewNote =
      tagViewActive && activeTagPath ? [activeTagPath] : [];
    const effectiveNoteFilter = tagViewActive ? "all" : noteFilter;
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
    mutateCreateNote({
      tags: tagsForNewNote,
      markdown: effectiveNoteFilter === "todo" ? "- [ ] " : "# ",
    });
  };

  const handleSelectAll = () => {
    withFlushedCurrentDraft(() => navigateToFilter("all", getCurrentNote()));
  };

  const handleSelectToday = () => {
    withFlushedCurrentDraft(() => navigateToFilter("today", getCurrentNote()));
  };

  const handleSelectTodo = () => {
    withFlushedCurrentDraft(() => navigateToFilter("todo", getCurrentNote()));
  };

  const handleSelectPinned = () => {
    withFlushedCurrentDraft(() => navigateToFilter("pinned", getCurrentNote()));
  };

  const handleSelectUntagged = () => {
    withFlushedCurrentDraft(() =>
      navigateToFilter("untagged", getCurrentNote()),
    );
  };

  const handleSelectArchive = () => {
    withFlushedCurrentDraft(() => navigateToDisposedFilter("archive"));
  };

  const handleSelectTrash = () => {
    withFlushedCurrentDraft(() => navigateToDisposedFilter("trash"));
  };

  const handleSelectTagPath = (tagPath: string) => {
    const { activeTagPath, tagViewActive } = useShellNavigationStore.getState();
    if (tagViewActive && activeTagPath === tagPath) {
      return;
    }

    withFlushedCurrentDraft((savedNote) => {
      navigateToTagPath(tagPath, savedNote ?? getCurrentNote());
    });
  };

  const handleSelectNote = (noteId: string) => {
    const { selectedNoteId } = useShellNavigationStore.getState();
    if (noteId === selectedNoteId) {
      setFocusedPane("notes");
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
