import { type BrowserWindow } from "electron";

let mainWindow: BrowserWindow;

export function setWindow(window: BrowserWindow) {
  mainWindow = window;
}

export function getWindow() {
  return mainWindow;
}
