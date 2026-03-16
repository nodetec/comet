import { create } from "zustand";

export type NoteFilter = "all" | "today" | "notebook" | "archive" | "trash";

type ShellStore = {
  activeNotebookId: string | null;
  activeTags: string[];
  draftMarkdown: string;
  draftNoteId: string | null;
  noteFilter: NoteFilter;
  searchQuery: string;
  selectedNoteId: string | null;
  clearActiveTags(): void;
  setDraft(noteId: string, markdown: string): void;
  setActiveTags(tags: string[]): void;
  setNoteFilter(filter: NoteFilter): void;
  setNotebookFilter(notebookId: string): void;
  setSearchQuery(query: string): void;
  setSelectedNoteId(noteId: string | null): void;
};

export const useShellStore = create<ShellStore>((set) => ({
  activeNotebookId: null,
  activeTags: [],
  draftMarkdown: "",
  draftNoteId: null,
  noteFilter: "all",
  searchQuery: "",
  selectedNoteId: null,
  clearActiveTags: () => {
    set({ activeTags: [] });
  },
  setDraft: (noteId, markdown) => {
    set({ draftMarkdown: markdown, draftNoteId: noteId });
  },
  setActiveTags: (activeTags) => {
    set({ activeTags });
  },
  setNoteFilter: (noteFilter) => {
    set((state) => ({
      activeNotebookId:
        noteFilter === "notebook" ? state.activeNotebookId : null,
      noteFilter,
    }));
  },
  setNotebookFilter: (activeNotebookId) => {
    set({ activeNotebookId, noteFilter: "notebook" });
  },
  setSearchQuery: (searchQuery) => {
    set({ searchQuery });
  },
  setSelectedNoteId: (selectedNoteId) => {
    set({ selectedNoteId });
  },
}));
