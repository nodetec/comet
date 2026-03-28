import { create } from "zustand";
import { type NoteFilter } from "@/shared/api/types";

export type { NoteFilter } from "@/shared/api/types";

export type FocusedPane = "sidebar" | "notes" | "editor";

type ShellStore = {
  activeTagPath: string | null;
  draftMarkdown: string;
  draftNoteId: string | null;
  focusedPane: FocusedPane;
  noteFilter: NoteFilter;
  searchQuery: string;
  selectedNoteId: string | null;
  clearActiveTagPath(): void;
  setDraft(noteId: string, markdown: string): void;
  setActiveTagPath(tagPath: string | null): void;
  setFocusedPane(pane: FocusedPane): void;
  setNoteFilter(filter: NoteFilter): void;
  setSearchQuery(query: string): void;
  setSelectedNoteId(noteId: string | null): void;
};

export const useShellStore = create<ShellStore>((set) => ({
  activeTagPath: null,
  draftMarkdown: "",
  draftNoteId: null,
  focusedPane: "notes",
  noteFilter: "all",
  searchQuery: "",
  selectedNoteId: null,
  clearActiveTagPath: () => {
    set({ activeTagPath: null });
  },
  setDraft: (noteId, markdown) => {
    set({ draftMarkdown: markdown, draftNoteId: noteId });
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
}));
