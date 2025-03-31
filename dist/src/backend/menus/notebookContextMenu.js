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
exports.setupNotebookContextMenu = setupNotebookContextMenu;
const api_1 = require("&/api");
const electron_1 = require("electron");
function setupNotebookContextMenu() {
    electron_1.ipcMain.on("notebookContextMenu", (event, notebookId) => {
        const template = [
            {
                label: "Hide",
                click: () => __awaiter(this, void 0, void 0, function* () {
                    yield (0, api_1.hideNotebook)(event, notebookId);
                    event.sender.send("notebookHidden", notebookId);
                }),
            },
            {
                label: "Delete",
                click: () => __awaiter(this, void 0, void 0, function* () {
                    yield (0, api_1.deleteNotebook)(event, notebookId);
                    event.sender.send("notebookDeleted", notebookId);
                }),
            },
        ];
        const menu = electron_1.Menu.buildFromTemplate(template);
        menu.popup();
    });
}
//# sourceMappingURL=notebookContextMenu.js.map