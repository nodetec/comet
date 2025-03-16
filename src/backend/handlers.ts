import { ipcMain } from "electron";

import * as api from "./api";

export function setupHandlers(): void {
  // notes
  ipcMain.handle("createNote", api.createNote);
  ipcMain.handle("getNoteFeed", api.getNoteFeed);
  ipcMain.handle("getNote", api.getNote);
  ipcMain.handle("saveNote", api.saveNote);
  ipcMain.handle("addPublishDetailsToNote", api.addPublishDetailsToNote);
  ipcMain.handle("searchNotes", api.searchNotes);

  // notebooks
  ipcMain.handle("createNotebook", api.createNotebook);
  ipcMain.handle("getNotebook", api.getNotebook);
  ipcMain.handle("getNotebooks", api.getNotebooks);
  ipcMain.handle("hideNotebook", api.hideNotebook);
  ipcMain.handle("unhideNotebook", api.unhideNotebook);
  ipcMain.handle("deleteNotebook", api.deleteNotebook);

  // tags
  ipcMain.handle("getAllTags", api.getAllTags);
  ipcMain.handle("getTagsByNotebookId", api.getTagsByNotebookId);
}
