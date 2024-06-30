import { Note } from "&/github.com/nodetec/captains-log/db/models";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface State {
  activeNote: Note | undefined;
  setActiveNote: (activeNote: Note | undefined) => void;
}

export const useAppState = create<State>()(
  persist(
    (set) => ({
      activeNote: undefined,
      setActiveNote: (activeNote) => set({ activeNote }),
    }),
    {
      name: "captains-log-storage",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
