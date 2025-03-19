import { type Keys } from "$/types/Keys";
import { type Relay } from "$/types/Relay";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface State {
  activeNoteId: string | undefined;
  setActiveNoteId: (activeNoteId: string | undefined) => void;

  keys: Keys | undefined;
  setKeys: (keys: Keys | undefined) => void;

  relays: Relay[];
  setRelays: (relays: Relay[]) => void;

  activeNotebookId: string | undefined;
  setActiveNotebookId: (notebookId: string | undefined) => void;

  activeNotebookName: string | undefined;
  setActiveNotebookName: (notebookName: string | undefined) => void;

  activeTags: string[];
  setActiveTags: (tags: string[]) => void;

  lastTagVisible: boolean;
  setLastTagVisible: (lastTagVisible: boolean) => void;

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

  noteSearch: string;
  setNoteSearch: (noteSearch: string) => void;

  settingsTab:
    | "profile"
    | "appearance"
    | "relays"
    | "editor"
    | "notebooks"
    | "sync";
  setSettingsTab: (
    settingsTab:
      | "profile"
      | "appearance"
      | "relays"
      | "editor"
      | "notebooks"
      | "sync",
  ) => void;

  syncRadio: "nosync" | "customsync";
  setSyncRadio: (syncRadio: "nosync" | "customsync") => void;
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

      activeNotebookId: undefined,
      setActiveNotebookId: (activeNotebookId) => set({ activeNotebookId }),

      activeNotebookName: undefined,
      setActiveNotebookName: (activeNotebookName) =>
        set({ activeNotebookName }),

      activeTags: [],
      setActiveTags: (activeTags) => set({ activeTags }),

      lastTagVisible: false,
      setLastTagVisible: (lastTagVisible) => set({ lastTagVisible }),

      feedType: "all",
      setFeedType: (feedType) => set({ feedType }),

      appFocus: undefined,
      setAppFocus: (appFocus) => set({ appFocus }),

      settingsTab: "profile",
      setSettingsTab: (settingsTab) => set({ settingsTab }),

      syncRadio: "nosync",
      setSyncRadio: (syncRadio) => set({ syncRadio }),

      noteSearch: "",
      setNoteSearch: (noteSearch) => set({ noteSearch }),
    }),
    {
      name: "comet-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        feedType: state.feedType,
        activeNoteId: state.activeNoteId,
        activeNotebookId: state.activeNotebookId,
        activeNotebookName: state.activeNotebookName,
        activeTags: state.activeTags,
        settingsTab: state.settingsTab,
        syncRadio: state.syncRadio,
        keys: state.keys,
      }),
    },
  ),
);
