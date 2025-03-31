"use strict";
// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
electron_1.contextBridge.exposeInMainWorld("api", {
    // notes
    createNote: (note) => electron_1.ipcRenderer.invoke("createNote", note),
    getNoteFeed: (offset, limit, sortField = "contentUpdatedAt", sortOrder = "desc", notebookId, trashFeed = false, tags) => electron_1.ipcRenderer.invoke("getNoteFeed", offset, limit, sortField, sortOrder, notebookId, trashFeed, tags),
    getNote: (id) => electron_1.ipcRenderer.invoke("getNote", id),
    saveNote: (update) => electron_1.ipcRenderer.invoke("saveNote", update),
    addPublishDetailsToNote: (update) => electron_1.ipcRenderer.invoke("addPublishDetailsToNote", update),
    searchNotes: (searchTerm, limit, offset, trashed, notebookId) => electron_1.ipcRenderer.invoke("searchNotes", searchTerm, limit, offset, trashed, notebookId),
    // notebooks
    createNotebook: (name) => electron_1.ipcRenderer.invoke("createNotebook", name),
    getNotebook: (id) => electron_1.ipcRenderer.invoke("getNotebook", id),
    getNotebooks: (showHidden) => electron_1.ipcRenderer.invoke("getNotebooks", showHidden),
    hideNotebook: (notebookId) => electron_1.ipcRenderer.invoke("hideNotebook", notebookId),
    unhideNotebook: (notebookId) => electron_1.ipcRenderer.invoke("unhideNotebook", notebookId),
    deleteNotebook: (notebookId) => electron_1.ipcRenderer.invoke("deleteNotebook", notebookId),
    // tags
    getAllTags: () => electron_1.ipcRenderer.invoke("getAllTags"),
    getTagsByNotebookId: (notebookId) => electron_1.ipcRenderer.invoke("getTagsByNotebookId", notebookId),
    // context menus
    noteCardContextMenu: (note, notebooks) => electron_1.ipcRenderer.send("noteCardContextMenu", note, notebooks),
    trashNoteCardContextMenu: (noteId) => electron_1.ipcRenderer.send("trashNoteCardContextMenu", noteId),
    notebookContextMenu: (notebookId) => electron_1.ipcRenderer.send("notebookContextMenu", notebookId),
    // sync
    syncDb: (remoteUrl) => electron_1.ipcRenderer.invoke("syncDb", remoteUrl),
    cancelSync: () => electron_1.ipcRenderer.invoke("cancelSync"),
    getSyncConfig: () => electron_1.ipcRenderer.invoke("getSyncConfig"),
    onSync: (handler) => {
        electron_1.ipcRenderer.on("sync", handler);
        return () => electron_1.ipcRenderer.removeListener("sync", handler);
    },
    // listeners
    onNoteMovedToTrash: (handler) => {
        electron_1.ipcRenderer.on("noteMovedToTrash", handler);
        return () => electron_1.ipcRenderer.removeListener("noteMovedToTrash", handler);
    },
    onNoteDeleted: (handler) => {
        electron_1.ipcRenderer.on("noteDeleted", handler);
        return () => electron_1.ipcRenderer.removeListener("noteDeleted", handler);
    },
    onNoteRestored: (handler) => {
        electron_1.ipcRenderer.on("noteRestored", handler);
        return () => electron_1.ipcRenderer.removeListener("noteRestored", handler);
    },
    onNoteMovedToNotebook: (handler) => {
        electron_1.ipcRenderer.on("noteMovedToNotebook", handler);
        return () => electron_1.ipcRenderer.removeListener("noteMovedToNotebook", handler);
    },
    onNotebookHidden: (handler) => {
        electron_1.ipcRenderer.on("notebookHidden", handler);
        return () => electron_1.ipcRenderer.removeListener("notebookHidden", handler);
    },
    onNotebookDeleted: (handler) => {
        electron_1.ipcRenderer.on("notebookDeleted", handler);
        return () => electron_1.ipcRenderer.removeListener("notebookDeleted", handler);
    },
    // window
    toggleMaximize: () => electron_1.ipcRenderer.invoke("toggleMaximize"),
});
//# sourceMappingURL=preload.js.map