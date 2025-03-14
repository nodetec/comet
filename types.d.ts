import { type InsertNote, type Note } from "$/types/Note";
import { type Notebook } from "$/types/Notebook";
import { type IpcRendererEvent } from "electron";

declare global {
  interface Window {
    api: {
      // notes
      createNote: (note: InsertNote) => Promise<string>;
      getNoteFeed: (
        offset: number,
        limit: number,
        sortField: "title" | "createdAt" | "contentUpdatedAt",
        sortOrder: "asc" | "desc",
        notebookId?: string,
        trashFeed?: boolean,
      ) => Promise<Note[]>;
      getNote: (id: string) => Promise<Note>;
      saveNote: (update: Partial<Note>) => Promise<string>;
      addPublishDetailsToNote: (update: Note) => Promise<void>;

      // notebooks
      createNotebook: (name: string) => Promise<string>;
      getNotebook: (id: string) => Promise<Notebook>;
      getNotebooks: (showHidden: boolean) => Promise<Notebook[]>;
      hideNotebook: (notebookId: string) => Promise<void>;
      unhideNotebook: (notebookId: string) => Promise<void>;
      deleteNotebook: (notebookId: string) => Promise<void>;

      // context menus
      noteCardContextMenu: (note: Note, notebooks: Notebook[]) => void;
      notebookContextMenu: (notebookId: string) => void;
      trashNoteCardContextMenu: (noteId: string) => void;

      // listeners
      onNoteMovedToTrash: (
        handler: (event: IpcRendererEvent, noteId: string) => void,
      ) => () => void;
      onNoteDeleted: (
        handler: (event: IpcRendererEvent, noteId: string) => void,
      ) => () => void;
      onNoteRestored: (
        handler: (event: IpcRendererEvent, noteId: string) => void,
      ) => () => void;
      onNoteMovedToNotebook: (
        handler: (event: IpcRendererEvent, noteId: string) => void,
      ) => () => void;
      onNotebookHidden: (
        handler: (event: IpcRendererEvent, notebookId: string) => void,
      ) => () => void;
      onNotebookDeleted: (
        handler: (event: IpcRendererEvent, notebookId: string) => void,
      ) => () => void;
    };
  }
}
