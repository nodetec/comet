import { deleteNotebook, hideNotebook } from "&/api";
import { ipcMain, Menu } from "electron";

export function setupNotebookContextMenu() {
  ipcMain.on("notebookContextMenu", (event, notebookId: string) => {
    const template = [
      {
        label: "Hide",
        click: async () => {
          await hideNotebook(event, notebookId);
          event.sender.send("notebookHidden", notebookId);
        },
      },
      {
        label: "Delete",
        click: async () => {
          await deleteNotebook(event, notebookId);
          event.sender.send("notebookDeleted", notebookId);
        },
      },
    ];

    const menu = Menu.buildFromTemplate(template);

    menu.popup();
  });
}
