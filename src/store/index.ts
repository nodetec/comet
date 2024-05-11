import { type Note, type Tag } from "~/types";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface State {
  filter: "all" | "trashed" | "archived";
  setFilter: (filter: "all" | "trashed" | "archived") => void;

  activeTag: Tag | undefined;
  setActiveTag: (activeTag: Tag | undefined) => void;

  currentNote: Note | undefined;
  setCurrentNote: (currentNote: Note | undefined) => void;

  currentTrashedNote: Note | undefined;
  setCurrentTrashedNote: (currentTrashedNote: Note | undefined) => void;

  noteSearch: string;
  setNoteSearch: (noteSearch: string) => void;

  noteContent: string | undefined;
  setNoteContent: (noteContent: string | undefined) => void;

  noteFeedScrollPosition: number | undefined;
  setNoteFeedScrollPosition: (noteFeedScrollPosition: number) => void;
}

export const useAppContext = create<State>()(
  persist(
    (set) => ({
      filter: "all",
      setFilter: (filter) => set({ filter }),

      activeTag: undefined,
      setActiveTag: (activeTag) => set({ activeTag }),

      currentNote: undefined,
      setCurrentNote: (currentNote) => set({ currentNote }),

      currentTrashedNote: undefined,
      setCurrentTrashedNote: (currentTrashedNote) => set({ currentTrashedNote }),

      noteSearch: "",
      setNoteSearch: (noteSearch) => set({ noteSearch: noteSearch }),

      noteContent: undefined,
      setNoteContent: (noteContent) => set({ noteContent }),

      noteFeedScrollPosition: undefined,
      setNoteFeedScrollPosition: (noteFeedScrollPosition) => set({ noteFeedScrollPosition }),
    }),
    {
      name: "captains-log-storage",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
