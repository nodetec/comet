import {
  Note,
  Notebook,
  Trash,
} from "&/github.com/nodetec/comet/db/models";
import { Tag } from "&/github.com/nodetec/comet/service";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface State {
  feedType: "all" | "notebook" | "trash";
  setFeedType: (feedType: "all" | "notebook" | "trash") => void;

  activeNote: Note | undefined;
  setActiveNote: (activeNote: Note | undefined) => void;

  activeNotebook: Notebook | undefined;
  setActiveNotebook: (activeNotebook: Notebook | undefined) => void;

  activeTag: Tag | undefined;
  setActiveTag: (activeNote: Tag | undefined) => void;

  activeTrashNote: Trash | undefined;
  setActiveTrashNote: (activeTrashNote: Trash | undefined) => void;

  searchActive: boolean;
  setSearchActive: (searchActive: boolean) => void;

  noteSearch: string;
  setNoteSearch: (noteSearch: string) => void;

  orderBy: "modified_at" | "created_at" | "title";
  setOrderBy: (orderBy: "modified_at" | "created_at" | "title") => void;

  timeSortDirection: "ASC" | "DESC";
  setTimeSortDirection: (sortDirection: "ASC" | "DESC") => void;

  titleSortDirection: "ASC" | "DESC";
  setTitleSortDirection: (sortDirection: "ASC" | "DESC") => void;

  editorFullScreen: boolean;
  setEditorFullScreen: (editorFullScreen: boolean) => void;

  isSelectNotebookDialogOpen: boolean;
  setIsSelectNotebookDialogOpen: (isSelectNotebookDialogOpen: boolean) => void;

  openPostBtnDialog: boolean;
  setOpenPostBtnDialog: (openPostBtnDialog: boolean) => void;

  selectedNote: Note | undefined;
  setSelectedNote: (selectedNote: Note | undefined) => void;
}

export const useAppState = create<State>()(
  persist(
    (set) => ({
      feedType: "all",
      setFeedType: (feedType) => set({ feedType }),

      activeNote: undefined,
      setActiveNote: (activeNote) => set({ activeNote }),

      activeNotebook: undefined,
      setActiveNotebook: (activeNotebook) => set({ activeNotebook }),

      activeTag: undefined,
      setActiveTag: (activeTag) => set({ activeTag }),

      activeTrashNote: undefined,
      setActiveTrashNote: (activeTrashNote) => set({ activeTrashNote }),

      searchActive: false,
      setSearchActive: (searchActive) => set({ searchActive }),

      noteSearch: "",
      setNoteSearch: (noteSearch) => set({ noteSearch }),

      orderBy: "modified_at",
      setOrderBy: (orderBy) => set({ orderBy }),

      timeSortDirection: "DESC",
      setTimeSortDirection: (timeSortDirection) => set({ timeSortDirection }),

      editorFullScreen: false,
      setEditorFullScreen: (editorFullScreen) => set({ editorFullScreen }),

      openPostBtnDialog: false,
      setOpenPostBtnDialog: (openPostBtnDialog) => set({ openPostBtnDialog }),

      isSelectNotebookDialogOpen: false,
      setIsSelectNotebookDialogOpen: (isSelectNotebookDialogOpen) =>
        set({ isSelectNotebookDialogOpen }),

      selectedNote: undefined,
      setSelectedNote: (selectedNote) => set({ selectedNote }),

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
