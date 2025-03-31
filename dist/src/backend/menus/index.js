"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupContextMenus = setupContextMenus;
const electron_context_menu_1 = __importDefault(require("electron-context-menu"));
const notebookContextMenu_1 = require("./notebookContextMenu");
const noteCardContextMenu_1 = require("./noteCardContextMenu");
const trashNoteCardContextMenu_1 = require("./trashNoteCardContextMenu");
function setupContextMenus() {
    (0, noteCardContextMenu_1.setupNoteCardContextMenu)();
    (0, trashNoteCardContextMenu_1.setupTrashNoteCardContextMenu)();
    (0, notebookContextMenu_1.setupNotebookContextMenu)();
    // Only setup default context menu if not on Linux
    if (process.platform !== "linux") {
        (0, electron_context_menu_1.default)({
            showInspectElement: false,
        });
    }
}
//# sourceMappingURL=index.js.map