"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupHandlers = setupHandlers;
const electron_1 = require("electron");
const api = __importStar(require("./api"));
function setupHandlers() {
    // notes
    electron_1.ipcMain.handle("createNote", api.createNote);
    electron_1.ipcMain.handle("getNoteFeed", api.getNoteFeed);
    electron_1.ipcMain.handle("getNote", api.getNote);
    electron_1.ipcMain.handle("saveNote", api.saveNote);
    electron_1.ipcMain.handle("addPublishDetailsToNote", api.addPublishDetailsToNote);
    electron_1.ipcMain.handle("searchNotes", api.searchNotes);
    // notebooks
    electron_1.ipcMain.handle("createNotebook", api.createNotebook);
    electron_1.ipcMain.handle("getNotebook", api.getNotebook);
    electron_1.ipcMain.handle("getNotebooks", api.getNotebooks);
    electron_1.ipcMain.handle("hideNotebook", api.hideNotebook);
    electron_1.ipcMain.handle("unhideNotebook", api.unhideNotebook);
    electron_1.ipcMain.handle("deleteNotebook", api.deleteNotebook);
    // tags
    electron_1.ipcMain.handle("getAllTags", api.getAllTags);
    electron_1.ipcMain.handle("getTagsByNotebookId", api.getTagsByNotebookId);
    // sync
    electron_1.ipcMain.handle("syncDb", api.syncDb);
    electron_1.ipcMain.handle("cancelSync", api.cancelSync);
    electron_1.ipcMain.handle("getSyncConfig", api.getSyncConfig);
    // window
    electron_1.ipcMain.handle("toggleMaximize", api.toggleMaximize);
}
//# sourceMappingURL=handlers.js.map