import { type Notebook, type Tag } from "&/comet/backend/models/models";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface State {
  feedType: "all" | "notebook" | "trash";
  setFeedType: (feedType: "all" | "notebook" | "trash") => void;

  activeNotebook: Notebook | undefined;
  setActiveNotebook: (activeNotebook: Notebook | undefined) => void;

  appFocus:
    | { panel: "sidebar" | "feed" | "editor" | undefined; isFocused: boolean }
    | undefined;
  setAppFocus: (
    appFocus:
      | { panel: "sidebar" | "feed" | "editor" | undefined; isFocused: boolean }
      | undefined,
  ) => void;

  activeTag: Tag | undefined;
  setActiveTag: (activeNote: Tag | undefined) => void;

  searchActive: boolean;
  setSearchActive: (searchActive: boolean) => void;

  noteSearch: string;
  setNoteSearch: (noteSearch: string) => void;

  lastTagVisible: boolean;
  setLastTagVisible: (lastTagVisible: boolean) => void;

  orderBy: "content_modified_at" | "created_at" | "title";
  setOrderBy: (orderBy: "content_modified_at" | "created_at" | "title") => void;

  timeSortDirection: "ASC" | "DESC";
  setTimeSortDirection: (sortDirection: "ASC" | "DESC") => void;

  titleSortDirection: "ASC" | "DESC";
  setTitleSortDirection: (sortDirection: "ASC" | "DESC") => void;

  editorFullScreen: boolean;
  setEditorFullScreen: (editorFullScreen: boolean) => void;

  settingsTab: "profile" | "appearance" | "relays" | "editor" | "notebooks";
  setSettingsTab: (
    settingsTab: "profile" | "appearance" | "relays" | "editor" | "notebooks",
  ) => void;

  isSelectNotebookDialogOpen: boolean;
  setIsSelectNotebookDialogOpen: (isSelectNotebookDialogOpen: boolean) => void;

  openPostBtnDialog: boolean;
  setOpenPostBtnDialog: (openPostBtnDialog: boolean) => void;
}

export const useAppState = create<State>()(
  persist(
    (set) => ({
      feedType: "all",
      setFeedType: (feedType) => set({ feedType }),

      activeNotebook: undefined,
      setActiveNotebook: (activeNotebook) => set({ activeNotebook }),

      appFocus: undefined,
      setAppFocus: (appFocus) => set({ appFocus }),

      activeTag: undefined,
      setActiveTag: (activeTag) => set({ activeTag }),

      searchActive: false,
      setSearchActive: (searchActive) => set({ searchActive }),

      noteSearch: "",
      setNoteSearch: (noteSearch) => set({ noteSearch }),

      lastTagVisible: false,
      setLastTagVisible: (lastTagVisible) => set({ lastTagVisible }),

      orderBy: "content_modified_at",
      setOrderBy: (orderBy) => set({ orderBy }),

      timeSortDirection: "DESC",
      setTimeSortDirection: (timeSortDirection) => set({ timeSortDirection }),

      editorFullScreen: false,
      setEditorFullScreen: (editorFullScreen) => set({ editorFullScreen }),

      settingsTab: "profile",
      setSettingsTab: (settingsTab) => set({ settingsTab }),

      openPostBtnDialog: false,
      setOpenPostBtnDialog: (openPostBtnDialog) => set({ openPostBtnDialog }),

      isSelectNotebookDialogOpen: false,
      setIsSelectNotebookDialogOpen: (isSelectNotebookDialogOpen) =>
        set({ isSelectNotebookDialogOpen }),

      titleSortDirection: "ASC",
      setTitleSortDirection: (titleSortDirection) =>
        set({ titleSortDirection }),
    }),
    {
      name: "comet-storage",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
