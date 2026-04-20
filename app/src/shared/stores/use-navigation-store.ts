import { create } from "zustand";

import type { NoteFilter } from "@/shared/api/types";
import { resetDraftState } from "./use-draft-store";

export type { NoteFilter } from "@/shared/api/types";

export type FocusedPane = "sidebar" | "notes" | "editor";

type NavigationActions = {
  navigateToDisposedFilter(filter: "archive" | "trash"): void;
  navigateToFilter(
    filter: NoteFilter,
    currentNote:
      | { archivedAt: number | null; deletedAt: number | null }
      | undefined,
  ): void;
  navigateToNote(noteId: string): void;
  navigateToTagPath(
    tagPath: string,
    currentNote: { tags: string[] } | undefined,
  ): void;
  prepareNoteCreation(): void;
  clearActiveTagPath(): void;
  setActiveTagPath(tagPath: string | null): void;
  setCreatingSelectedNoteId(id: string | null): void;
  setFocusedPane(pane: FocusedPane): void;
  setIsCreatingNoteTransition(value: boolean): void;
  setNoteFilter(filter: NoteFilter): void;
  setPendingAutoFocusEditorNoteId(id: string | null): void;
  setSearchQuery(query: string): void;
  setSelectedNoteId(noteId: string | null): void;
  setTagViewActive(active: boolean): void;
};

export type NavigationState = {
  activeTagPath: string | null;
  creatingSelectedNoteId: string | null;
  focusedPane: FocusedPane;
  isCreatingNoteTransition: boolean;
  noteFilter: NoteFilter;
  pendingAutoFocusEditorNoteId: string | null;
  searchQuery: string;
  selectedNoteId: string | null;
  tagViewActive: boolean;
  actions: NavigationActions;
};

const useNavigationStore = create<NavigationState>((set) => ({
  activeTagPath: null,
  creatingSelectedNoteId: null,
  focusedPane: "notes",
  isCreatingNoteTransition: false,
  noteFilter: "all",
  pendingAutoFocusEditorNoteId: null,
  searchQuery: "",
  selectedNoteId: null,
  tagViewActive: false,
  actions: {
    setCreatingSelectedNoteId: (creatingSelectedNoteId) => {
      set({ creatingSelectedNoteId });
    },
    setIsCreatingNoteTransition: (isCreatingNoteTransition) => {
      set({ isCreatingNoteTransition });
    },
    setPendingAutoFocusEditorNoteId: (pendingAutoFocusEditorNoteId) => {
      set({ pendingAutoFocusEditorNoteId });
    },
    clearActiveTagPath: () => {
      set({ activeTagPath: null, tagViewActive: false });
    },
    setActiveTagPath: (activeTagPath) => {
      set({ activeTagPath });
    },
    setFocusedPane: (focusedPane) => {
      set({ focusedPane });
    },
    setNoteFilter: (noteFilter) => {
      set({ noteFilter });
    },
    setSearchQuery: (searchQuery) => {
      set({ searchQuery });
    },
    setSelectedNoteId: (selectedNoteId) => {
      set({ selectedNoteId });
    },
    setTagViewActive: (tagViewActive) => {
      set({ tagViewActive });
    },
    navigateToFilter: (filter, currentNote) => {
      const clearSelection =
        currentNote && (currentNote.archivedAt || currentNote.deletedAt);
      if (clearSelection) {
        resetDraftState();
      }
      set({
        ...(clearSelection ? { selectedNoteId: null } : {}),
        tagViewActive: false,
        noteFilter: filter,
      });
    },
    navigateToDisposedFilter: (filter) => {
      resetDraftState();
      set({
        selectedNoteId: null,
        tagViewActive: false,
        noteFilter: filter,
      });
    },
    navigateToTagPath: (tagPath, currentNote) => {
      set((state) => {
        if (state.tagViewActive && state.activeTagPath === tagPath) {
          return state;
        }

        const outOfScope =
          currentNote &&
          !currentNote.tags.some(
            (tag) => tag === tagPath || tag.startsWith(`${tagPath}/`),
          );

        if (outOfScope) {
          resetDraftState();
        }

        return {
          ...(outOfScope ? { selectedNoteId: null } : {}),
          tagViewActive: true,
          activeTagPath: tagPath,
        };
      });
    },
    navigateToNote: (noteId) => {
      set({
        selectedNoteId: noteId,
        focusedPane: "notes",
        creatingSelectedNoteId: null,
        pendingAutoFocusEditorNoteId: null,
      });
    },
    prepareNoteCreation: () => {
      set({
        searchQuery: "",
        creatingSelectedNoteId: null,
        isCreatingNoteTransition: true,
      });
    },
  },
}));

export { useNavigationStore };
