import {
  Note,
  Notebook,
  Trash,
} from "&/github.com/nodetec/captains-log/db/models";
import { Tag } from "&/github.com/nodetec/captains-log/service";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface State {
  feedType: "all" | "notebook" | "trash";
  setFeedType: (feedType: "all" | "notebook" | "trash") => void;

  activeNote: Note | undefined;
  setActiveNote: (activeNote: Note | undefined) => void;

  activeNotebook: Notebook | undefined;
  setActiveNotebook: (activeNotebook: Notebook | undefined) => void;

  activeTag: Tag | undefined;
  setActiveTag: (activeNote: Tag | undefined) => void;

  activeTrashNote: Trash | undefined;
  setActiveTrashNote: (activeTrashNote: Trash | undefined) => void;

  searchActive: boolean;
  setSearchActive: (searchActive: boolean) => void;

  noteSearch: string;
  setNoteSearch: (noteSearch: string) => void;

  orderBy: "modified_at" | "created_at" | "title";
  setOrderBy: (orderBy: "modified_at" | "created_at" | "title") => void;

  sortDirection: "ASC" | "DESC";
  setSortDirection: (sortDirection: "ASC" | "DESC") => void;
}

export const useAppState = create<State>()(
  persist(
    (set) => ({
      feedType: "all",
      setFeedType: (feedType) => set({ feedType }),

      activeNote: undefined,
      setActiveNote: (activeNote) => set({ activeNote }),

      activeNotebook: undefined,
      setActiveNotebook: (activeNotebook) => set({ activeNotebook }),

      activeTag: undefined,
      setActiveTag: (activeTag) => set({ activeTag }),

      activeTrashNote: undefined,
      setActiveTrashNote: (activeTrashNote) => set({ activeTrashNote }),

      searchActive: false,
      setSearchActive: (searchActive) => set({ searchActive }),

      noteSearch: "",
      setNoteSearch: (noteSearch) => set({ noteSearch }),

      orderBy: "modified_at",
      setOrderBy: (orderBy) => set({ orderBy }),

      sortDirection: "DESC",
      setSortDirection: (sortDirection) => set({ sortDirection }),
    }),
    {
      name: "captains-log-storage",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
