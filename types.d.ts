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
        tags?: string[],
      ) => Promise<Note[]>;
      getNote: (id: string) => Promise<Note>;
      saveNote: (update: Partial<Note>) => Promise<string>;
      addPublishDetailsToNote: (update: Note) => Promise<void>;
      searchNotes: (
        searchTerm: string,
        limit: number,
        offset: number,
        trashed: boolean,
        notebookId?: string,
      ) => Promise<Note[]>;

      // notebooks
      createNotebook: (name: string) => Promise<string>;
      getNotebook: (id: string) => Promise<Notebook>;
      getNotebooks: (showHidden: boolean) => Promise<Notebook[]>;
      hideNotebook: (notebookId: string) => Promise<void>;
      unhideNotebook: (notebookId: string) => Promise<void>;
      deleteNotebook: (notebookId: string) => Promise<void>;

      // tags
      getAllTags: () => Promise<string[]>;
      getTagsByNotebookId: (notebookId: string) => Promise<string[]>;

      // sync
      syncDb: (remoteUrl: string) => Promise<void>;
      cancelSync: () => Promise<void>;
      getSyncConfig: () => Promise<
        | {
            remote: {
              url: string | undefined;
            };
            method: "no_sync" | "custom_sync";
          }
        | undefined
      >;

      // context menus
      noteCardContextMenu: (note: Note, notebooks: Notebook[]) => void;
      notebookContextMenu: (notebookId: string) => void;
      trashNoteCardContextMenu: (noteId: string) => void;

      onSync: (handler: (event: IpcRendererEvent) => void) => () => void;

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
