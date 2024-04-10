import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { ActiveNote, Tag } from "~/types";

interface State {
  activeNote: ActiveNote | undefined;
  setActiveNote: (note: ActiveNote | undefined) => void;
  activeTag: Tag | undefined;
  setActiveTag: (activeTag: Tag | undefined) => void;
  noteSearch: string | undefined;
  setNoteSearch: (noteSearch: string | undefined) => void;
}

export const useGlobalState = create<State>()(
    // persist(
      (set) => ({
        activeNote: undefined,
        setActiveNote: (note) => set({ activeNote: note }),
        activeTag: undefined,
        setActiveTag: (tag) => set({ activeTag: tag }),
        noteSearch: undefined,
        setNoteSearch: (noteSearch) => set({ noteSearch: noteSearch }),
      }),
      // {
      //   name: "captains-log-storage",
      //   storage: createJSONStorage(() => localStorage)
      // },
    // ),
);