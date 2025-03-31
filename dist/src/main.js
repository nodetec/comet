"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_events_1 = require("node:events");
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const db_1 = require("&/db");
const syncDb_1 = require("&/db/utils/syncDb");
const handlers_1 = require("&/handlers");
const menus_1 = require("&/menus");
const store_1 = require("&/store");
const window_1 = require("&/window");
const electron_1 = require("electron");
const electron_drag_click_1 = __importDefault(require("electron-drag-click"));
const electron_is_dev_1 = __importDefault(require("electron-is-dev"));
let dbDir;
if (electron_is_dev_1.default) {
    dbDir = "db-test";
}
else {
    dbDir = "db-alpha";
}
node_events_1.EventEmitter.defaultMaxListeners = 20;
(0, electron_drag_click_1.default)();
// Handle creating/removing shortcuts on Windows when installing/uninstalling.
// eslint-disable-next-line @typescript-eslint/no-require-imports
if (require("electron-squirrel-startup")) {
    electron_1.app.quit();
}
const createWindow = () => {
    var _a;
    // Create the browser window.
    const mainWindow = new electron_1.BrowserWindow(Object.assign(Object.assign({ width: 1200, height: 600, minHeight: 370, minWidth: 710, autoHideMenuBar: true, backgroundColor: "#1D1E20" }, (process.platform === "darwin"
        ? {
            titleBarStyle: "hidden",
            trafficLightPosition: { x: 18, y: 18 },
        }
        : {})), { webPreferences: {
            preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
            // additionalArguments: [
            //   // Windows: C:\Users\<username>\AppData\Roaming\<YourAppName>
            //   // macOS: ~/Library/Application Support/<YourAppName>
            //   // Linux: ~/.config/<YourAppName>
            // ],
        } }));
    (0, window_1.setWindow)(mainWindow);
    const store = (0, store_1.getStore)();
    try {
        const syncConfig = store.get("sync");
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        (0, syncDb_1.sync)((_a = syncConfig === null || syncConfig === void 0 ? void 0 : syncConfig.remote.url) !== null && _a !== void 0 ? _a : "");
    }
    catch (error) {
        // console.log("error", error);
        console.log("sync config not set");
    }
    // and load the index.html of the app.
    void mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
    // Electron window hack
    mainWindow.once("ready-to-show", () => {
        // center the main window
        if (!mainWindow)
            return;
        mainWindow.center();
    });
    if (electron_is_dev_1.default) {
        mainWindow.webContents.openDevTools({ mode: "detach" });
    }
    else {
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
void electron_1.app
    .whenReady()
    .then(() => __awaiter(void 0, void 0, void 0, function* () {
    yield node_fs_1.promises.mkdir(node_path_1.default.join(electron_1.app.getPath("appData"), "comet", dbDir, "db"), {
        recursive: true,
    });
    (0, store_1.initStore)();
    yield (0, db_1.initDb)(node_path_1.default.join(electron_1.app.getPath("appData"), "comet", dbDir, "db"));
    (0, handlers_1.setupHandlers)();
    (0, menus_1.setupContextMenus)();
    createWindow();
}))
    .catch(console.error);
// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        electron_1.app.quit();
    }
});
electron_1.app.on("activate", () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (electron_1.BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
//# sourceMappingURL=main.js.map