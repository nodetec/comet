import { type ActiveNote } from "~/types";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface State {
  activeNote: ActiveNote;
  setActiveNote: (note: ActiveNote) => void;
  noteSearch: string | undefined;
  setNoteSearch: (noteSearch: string | undefined) => void;
}

// TODO: partial state storage, leave out search
export const useGlobalState = create<State>()(
  persist(
    (set) => ({
      activeNote: {
        context: "all",
        note: undefined,
        tag: undefined,
        archivedNote: undefined,
      },
      setActiveNote: (note) => set({ activeNote: note }),
      noteSearch: undefined,
      setNoteSearch: (noteSearch) => set({ noteSearch: noteSearch }),
    }),
    {
      name: "captains-log-storage",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
