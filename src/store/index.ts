import { type Note, type Settings, type Tag } from "~/types";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface State {
  filter: "all" | "trashed" | "archived";
  setFilter: (filter: "all" | "trashed" | "archived") => void;

  activePage: "editor" | "settings";
  setActivePage: (activePage: "editor" | "settings") => void;

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

  settings: Settings;
  setSettings: (settings: Settings) => void;

  deleteTagDialog: boolean;
  setDeleteTagDialog: (deleteTagDialog: boolean) => void;

  deleteTagDialogId: number | undefined;
  setDeleteTagDialogId: (deleteTagDialogId: number | undefined) => void;
}

export const useAppContext = create<State>()(
  persist(
    (set) => ({
      filter: "all",
      setFilter: (filter) => set({ filter }),

      activePage: "editor",
      setActivePage: (activePage) => set({ activePage }),

      activeTag: undefined,
      setActiveTag: (activeTag) => set({ activeTag }),

      currentNote: undefined,
      setCurrentNote: (currentNote) => set({ currentNote }),

      currentTrashedNote: undefined,
      setCurrentTrashedNote: (currentTrashedNote) =>
        set({ currentTrashedNote }),

      noteSearch: "",
      setNoteSearch: (noteSearch) => set({ noteSearch: noteSearch }),

      noteContent: undefined,
      setNoteContent: (noteContent) => set({ noteContent }),

      noteFeedScrollPosition: undefined,
      setNoteFeedScrollPosition: (noteFeedScrollPosition) =>
        set({ noteFeedScrollPosition }),

      settings: {
        theme: "dark",
        vim: "false",
        line_numbers: "false",
        highlight_active_line: "false",
        line_wrapping: "true",
        unordered_list_bullet: "*",
        indent_unit: "",
        tab_size: "",
        font_size: "",
        font_family: "",
        font_weight: "normal",
        line_height: "",
        nsec: "",
        npub: "",
        relays: "[\"relay.damus.io\", \"nos.lol\"]",
      },
      setSettings: (settings) => set({ settings }),

      deleteTagDialog: false,
      setDeleteTagDialog: (deleteTagDialog) => set({ deleteTagDialog }),

      deleteTagDialogId: undefined,
      setDeleteTagDialogId: (deleteTagDialogId) => set({ deleteTagDialogId }),
    }),
    {
      name: "captains-log-storage",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
