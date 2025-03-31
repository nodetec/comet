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
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupNoteCardContextMenu = setupNoteCardContextMenu;
const api_1 = require("&/api");
const electron_1 = require("electron");
function setupNoteCardContextMenu() {
    electron_1.ipcMain.on("noteCardContextMenu", (event, note, notebooks) => {
        console.log("Note card right clicked", note._id);
        const notebooksNoteDoesNotBelongTo = notebooks.filter((notebook) => notebook._id !== note.notebookId);
        const template = [
            {
                label: "Move To",
                submenu: notebooksNoteDoesNotBelongTo.map((notebook) => ({
                    label: notebook.name,
                    click: () => __awaiter(this, void 0, void 0, function* () {
                        yield (0, api_1.moveNoteToNotebook)(event, note._id, notebook._id);
                        event.sender.send("noteMovedToNotebook", note._id, notebook._id);
                    }),
                })),
            },
            {
                label: "Trash",
                click: () => __awaiter(this, void 0, void 0, function* () {
                    yield (0, api_1.moveNoteToTrash)(event, note._id);
                    event.sender.send("noteMovedToTrash", note._id);
                }),
            },
        ];
        const menu = electron_1.Menu.buildFromTemplate(template);
        console.log("menu", menu);
        menu.popup();
        // menu.popup({ x: 100, y: 200 }); // use this later
    });
}
//# sourceMappingURL=noteCardContextMenu.js.map