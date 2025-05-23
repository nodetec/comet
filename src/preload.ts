// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

import { type InsertNote, type Note } from "./types/Note";
import { type Notebook } from "./types/Notebook";

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("api", {
  // notes
  createNote: (note: InsertNote) =>
    ipcRenderer.invoke("createNote", note) as Promise<string>,
  getNoteFeed: (
    offset: number,
    limit: number,
    notebookId,
    trashFeed = false,
    tags?: string[],
  ) =>
    ipcRenderer.invoke(
      "getNoteFeed",
      offset,
      limit,
      notebookId,
      trashFeed,
      tags,
    ) as Promise<Note[]>,
  getNote: (id: string) => ipcRenderer.invoke("getNote", id) as Promise<Note>,
  saveNote: (update: Partial<Note>) =>
    ipcRenderer.invoke("saveNote", update) as Promise<string>,
  addPublishDetailsToNote: (update: Note) =>
    ipcRenderer.invoke("addPublishDetailsToNote", update) as Promise<void>,
  searchNotes: (
    searchTerm: string,
    limit: number,
    offset: number,
    trashed: boolean,
    notebookId?: string,
  ) =>
    ipcRenderer.invoke(
      "searchNotes",
      searchTerm,
      limit,
      offset,
      trashed,
      notebookId,
    ) as Promise<Note[]>,

  // notebooks
  createNotebook: (name: string) =>
    ipcRenderer.invoke("createNotebook", name) as Promise<string>,
  getNotebook: (id: string) =>
    ipcRenderer.invoke("getNotebook", id) as Promise<Notebook>,
  getNotebooks: (showHidden: boolean) =>
    ipcRenderer.invoke("getNotebooks", showHidden) as Promise<Notebook[]>,
  hideNotebook: (notebookId: string) =>
    ipcRenderer.invoke("hideNotebook", notebookId) as Promise<void>,
  unhideNotebook: (notebookId: string) =>
    ipcRenderer.invoke("unhideNotebook", notebookId) as Promise<void>,
  deleteNotebook: (notebookId: string) =>
    ipcRenderer.invoke("deleteNotebook", notebookId) as Promise<void>,

  // tags
  getAllTags: () => ipcRenderer.invoke("getAllTags") as Promise<string[]>,
  getTagsByNotebookId: (notebookId: string) =>
    ipcRenderer.invoke("getTagsByNotebookId", notebookId) as Promise<string[]>,

  // context menus
  noteCardContextMenu: (note: Note, notebooks: Notebook[]) =>
    ipcRenderer.send("noteCardContextMenu", note, notebooks),
  trashNoteCardContextMenu: (noteId: string) =>
    ipcRenderer.send("trashNoteCardContextMenu", noteId),
  notebookContextMenu: (notebookId: string) =>
    ipcRenderer.send("notebookContextMenu", notebookId),
  sortContextMenu: (x?: number, y?: number) =>
    ipcRenderer.send("sortContextMenu", x, y),
  notebookSortContextMenu: (notebook: Notebook, x?: number, y?: number) =>
    ipcRenderer.send("notebookSortContextMenu", notebook, x, y),

  // sync
  syncDb: (remoteUrl: string) => ipcRenderer.invoke("syncDb", remoteUrl),
  cancelSync: () => ipcRenderer.invoke("cancelSync"),
  getSyncConfig: () => ipcRenderer.invoke("getSyncConfig"),
  getSortSettings: () =>
    ipcRenderer.invoke("getSortSettings") as Promise<{
      sortBy: "createdAt" | "editedAt" | "title";
      sortOrder: "asc" | "desc";
    }>,
  updateSortSettings: (
    sortBy: "createdAt" | "editedAt" | "title",
    sortOrder: "asc" | "desc",
  ) =>
    ipcRenderer.invoke(
      "updateSortSettings",
      sortBy,
      sortOrder,
    ) as Promise<void>,
  onSync: (handler: (event: IpcRendererEvent) => void) => {
    ipcRenderer.on("sync", handler);
    return () => ipcRenderer.removeListener("sync", handler);
  },

  // listeners
  onNoteMovedToTrash: (
    handler: (event: IpcRendererEvent, noteId: string) => void,
  ) => {
    ipcRenderer.on("noteMovedToTrash", handler);
    return () => ipcRenderer.removeListener("noteMovedToTrash", handler);
  },
  onNoteDeleted: (
    handler: (event: IpcRendererEvent, noteId: string) => void,
  ) => {
    ipcRenderer.on("noteDeleted", handler);
    return () => ipcRenderer.removeListener("noteDeleted", handler);
  },
  onNoteRestored: (
    handler: (event: IpcRendererEvent, noteId: string) => void,
  ) => {
    ipcRenderer.on("noteRestored", handler);
    return () => ipcRenderer.removeListener("noteRestored", handler);
  },
  onNoteMovedToNotebook: (
    handler: (event: IpcRendererEvent, noteId: string) => void,
  ) => {
    ipcRenderer.on("noteMovedToNotebook", handler);
    return () => ipcRenderer.removeListener("noteMovedToNotebook", handler);
  },
  onNotebookHidden: (handler: (e: IpcRendererEvent, id: string) => void) => {
    ipcRenderer.on("notebookHidden", handler);
    return () => ipcRenderer.removeListener("notebookHidden", handler);
  },
  onNotebookDeleted: (handler: (e: IpcRendererEvent, id: string) => void) => {
    ipcRenderer.on("notebookDeleted", handler);
    return () => ipcRenderer.removeListener("notebookDeleted", handler);
  },
  onSortSettingsUpdated: (
    handler: (
      event: IpcRendererEvent,
      settings: { sortBy: "createdAt" | "editedAt" | "title"; sortOrder: "asc" | "desc" },
    ) => void,
  ) => {
    ipcRenderer.on("sortSettingsUpdated", handler);
    return () => ipcRenderer.removeListener("sortSettingsUpdated", handler);
  },
  onNotebookSortSettingsUpdated: (
    handler: (event: IpcRendererEvent, notebook: Notebook) => void,
  ) => {
    ipcRenderer.on("notebookSortSettingsUpdated", handler);
    return () => ipcRenderer.removeListener("notebookSortSettingsUpdated", handler);
  },

  // window
  toggleMaximize: () => ipcRenderer.invoke("toggleMaximize"),
} satisfies Window["api"]);
