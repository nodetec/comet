import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { ActiveNote } from "~/types";

interface State {
  activeNote: ActiveNote | undefined;
  setActiveNote: (note: ActiveNote | undefined) => void;
}

export const useGlobalState = create<State>()(
    persist(
      (set) => ({
        activeNote: undefined,
        setActiveNote: (note) => set({ activeNote: note }),
      
      }),
      {
        name: "captains-log-storage",
        storage: createJSONStorage(() => localStorage)
      },
    ),
);