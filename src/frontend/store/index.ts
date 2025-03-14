import { type Relay } from "$/types/Relay";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface State {
  activeNoteId: string | undefined;
  setActiveNoteId: (activeNoteId: string | undefined) => void;

  keys: { nsec: string; npub: string } | undefined;
  setKeys: (keys: { nsec: string; npub: string } | undefined) => void;

  relays: Relay[];
  setRelays: (relays: Relay[]) => void;

  activeNotebookId: string;
  setActiveNotebookId: (notebookId: string) => void;

  activeNotebookName: string | undefined;
  setActiveNotebookName: (notebookName: string | undefined) => void;

  feedType: "all" | "notebook" | "trash";
  setFeedType: (feedType: "all" | "notebook" | "trash") => void;

  appFocus:
    | { panel: "sidebar" | "feed" | "editor" | undefined; isFocused: boolean }
    | undefined;
  setAppFocus: (
    appFocus:
      | { panel: "sidebar" | "feed" | "editor" | undefined; isFocused: boolean }
      | undefined,
  ) => void;

  settingsTab: "profile" | "appearance" | "relays" | "editor" | "notebooks";
  setSettingsTab: (
    settingsTab: "profile" | "appearance" | "relays" | "editor" | "notebooks",
  ) => void;
}

export const useAppState = create<State>()(
  persist(
    (set) => ({
      activeNoteId: undefined,
      setActiveNoteId: (activeNoteId) => set({ activeNoteId }),

      keys: undefined,
      setKeys: (keys) => set({ keys }),

      relays: [{ url: "wss://relay.damus.io", read: true, write: true }],
      setRelays: (relays) => set({ relays }),

      activeNotebookId: "all",
      setActiveNotebookId: (activeNotebookId) => set({ activeNotebookId }),

      activeNotebookName: undefined,
      setActiveNotebookName: (activeNotebookName) =>
        set({ activeNotebookName }),

      feedType: "all",
      setFeedType: (feedType) => set({ feedType }),

      appFocus: undefined,
      setAppFocus: (appFocus) => set({ appFocus }),

      settingsTab: "profile",
      setSettingsTab: (settingsTab) => set({ settingsTab }),
    }),
    {
      name: "comet-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        feedType: state.feedType,
        activeNoteId: state.activeNoteId,
        activeNotebookId: state.activeNotebookId,
        activeNotebookName: state.activeNotebookName,
        settingsTab: state.settingsTab,
        keys: state.keys,
      }),
    },
  ),
);
