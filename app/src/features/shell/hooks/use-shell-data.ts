import { useNoteMutations } from "@/features/notes-pane/hooks/use-note-mutations";
import { useNoteQueries } from "@/features/notes-pane/hooks/use-note-queries";
import type { QueryClient } from "@tanstack/react-query";
import type { RefObject } from "react";
import type {
  NoteFilter,
  NoteSortDirection,
  NoteSortField,
  WikiLinkResolutionInput,
} from "@/shared/api/types";

export interface ShellDataDeps {
  activeTagPath: string | null;
  clearDraftWikilinkResolutions: (noteId?: string) => void;
  currentNotesSelectionId: string | null;
  draftMarkdown: string;
  draftNoteId: string | null;
  effectiveNoteFilter: NoteFilter;
  isSavingRef: RefObject<boolean>;
  noteFilter: NoteFilter;
  queryClient: QueryClient;
  searchQuery: string;
  setDraft: (
    id: string,
    markdown: string,
    options?: {
      preserveWikilinkResolutions?: boolean;
      wikilinkResolutions?: WikiLinkResolutionInput[];
    },
  ) => void;
  setNoteFilter: (filter: NoteFilter) => void;
  setSelectedNoteId: (id: string | null) => void;
  sortField: NoteSortField;
  sortDirection: NoteSortDirection;
  tagViewActive: boolean;
}

export function useShellData(deps: ShellDataDeps) {
  const queries = useNoteQueries({
    noteFilter: deps.noteFilter,
    activeTagPath: deps.activeTagPath,
    tagViewActive: deps.tagViewActive,
    searchQuery: deps.searchQuery,
    sortField: deps.sortField,
    sortDirection: deps.sortDirection,
    selectedNoteId: deps.currentNotesSelectionId,
  });

  const mutations = useNoteMutations({
    queryClient: deps.queryClient,
    currentNotes: queries.currentNotes,
    selectedNoteId: deps.currentNotesSelectionId,
    noteFilter: deps.effectiveNoteFilter,
    activeNpub: queries.activeNpub,
    isSavingRef: deps.isSavingRef,
    clearDraftWikilinkResolutions: deps.clearDraftWikilinkResolutions,
    setSelectedNoteId: deps.setSelectedNoteId,
    setDraft: deps.setDraft,
    setNoteFilter: deps.setNoteFilter,
  });

  return { ...queries, ...mutations };
}
