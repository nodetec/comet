import { Note, Trash } from "&/github.com/nodetec/captains-log/db/models";
import { Tag } from "&/github.com/nodetec/captains-log/service";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface State {
  feedType: "all" | "trash" | "tag" | "search";
  setFeedType: (feedType: "all" | "trash" | "tag" | "search") => void;

  activeNote: Note | undefined;
  setActiveNote: (activeNote: Note | undefined) => void;

  activeTag: Tag | undefined;
  setActiveTag: (activeNote: Tag | undefined) => void;

  activeTrashNote: Trash | undefined;
  setActiveTrashNote: (activeTrashNote: Trash | undefined) => void;
}

export const useAppState = create<State>()(
  persist(
    (set) => ({
      feedType: "all",
      setFeedType: (feedType) => set({ feedType }),

      activeNote: undefined,
      setActiveNote: (activeNote) => set({ activeNote }),

      activeTag: undefined,
      setActiveTag: (activeTag) => set({ activeTag }),

      activeTrashNote: undefined,
      setActiveTrashNote: (activeTrashNote) => set({ activeTrashNote }),
    }),
    {
      name: "captains-log-storage",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
