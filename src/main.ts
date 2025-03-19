import { EventEmitter } from "events";
import { promises as fsPromises } from "fs";
import path from "path";

import { initDb } from "&/db";
import { sync } from "&/db/utils/syncDb";
import { setupHandlers } from "&/handlers";
import { setupContextMenus } from "&/menus";
import { getStore, initStore } from "&/store";
import { setWindow } from "&/window";
import { app, BrowserWindow } from "electron";
import isDev from "electron-is-dev";

EventEmitter.defaultMaxListeners = 20;

// This allows TypeScript to pick up the magic constants that's auto-generated by Forge's Webpack
// plugin that tells the Electron app where to look for the Webpack-bundled app code (depending on
// whether you're running in development or production).
declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
// eslint-disable-next-line @typescript-eslint/no-require-imports
if (require("electron-squirrel-startup")) {
  app.quit();
}

const createWindow = (): void => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 600,
    minHeight: 350,
    minWidth: 980,
    autoHideMenuBar: true,
    backgroundColor: "#1D1E20",
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hidden",
          trafficLightPosition: { x: 18, y: 18 },
        }
      : {}),

    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      // additionalArguments: [
      //   // Windows: C:\Users\<username>\AppData\Roaming\<YourAppName>
      //   // macOS: ~/Library/Application Support/<YourAppName>
      //   // Linux: ~/.config/<YourAppName>
      // ],
    },
  });

  setWindow(mainWindow);

  const store = getStore();

  try {
    // @ts-expect-error - electron store is module only and electron forge is not
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const syncConfig = store.get("sync") as
      | {
          remote: {
            url: string | undefined;
          };
          method: "no_sync" | "custom_sync";
        }
      | undefined;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    sync(syncConfig?.remote.url ?? "");
  } catch (error) {
    // console.log("error", error);
    console.log("sync config not set");
  }

  // and load the index.html of the app.
  void mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  // Electron window hack
  mainWindow.once("ready-to-show", () => {
    // center the main window
    if (!mainWindow) return;
    mainWindow.center();
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    console.log("Running in production");
  }
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
// app.on("ready", () => {
//   // On OS X it's common to re-create a window in the app when the
//   // dock icon is clicked and there are no other windows open.
//   createWindow();
// });

void app
  .whenReady()
  .then(async () => {
    await fsPromises.mkdir(
      path.join(app.getPath("appData"), "comet", "db-alpha"),
      {
        recursive: true,
      },
    );
    initStore();
    await initDb(
      path.join(app.getPath("appData"), "comet", "db-alpha", "comet-alpha"),
    );
    setupHandlers();
    setupContextMenus();
    createWindow();
  })
  .catch(console.error);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
