import { type AppContext } from "~/types";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface State {
  appContext: AppContext;
  setAppContext: (appContext: AppContext) => void;
  noteSearch: string | undefined;
  setNoteSearch: (noteSearch: string | undefined) => void;
}

export const useGlobalState = create<State>()(
  persist(
    (set) => ({
      appContext: {
        filter: "all",
        currentNote: undefined,
        activeTag: undefined,
        currentTrashedNote: undefined,
      },
      setAppContext: (appContext) => set({ appContext }),
      noteSearch: undefined,
      setNoteSearch: (noteSearch) => set({ noteSearch: noteSearch }),
    }),
    {
      name: "captains-log-storage",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
