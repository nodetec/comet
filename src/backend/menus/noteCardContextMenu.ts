import { moveNoteToNotebook, moveNoteToTrash } from "&/api";
import { type Note } from "$/types/Note";
import { type Notebook } from "$/types/Notebook";
import { ipcMain, Menu } from "electron";

export function setupNoteCardContextMenu() {
  ipcMain.on(
    "noteCardContextMenu",
    (event, note: Note, notebooks: Notebook[]) => {
      console.log("Note card right clicked", note._id);

      const notebooksNoteDoesNotBelongTo = notebooks.filter(
        (notebook) => notebook._id !== note.notebookId,
      );

      const template = [
        {
          label: "Move To",
          submenu: notebooksNoteDoesNotBelongTo.map((notebook) => ({
            label: notebook.name,
            click: async () => {
              await moveNoteToNotebook(event, note._id, notebook._id);
              event.sender.send("noteMovedToNotebook", note._id, notebook._id);
            },
          })),
        },

        {
          label: "Trash",
          click: async () => {
            await moveNoteToTrash(event, note._id);
            event.sender.send("noteMovedToTrash", note._id);
          },
        },
      ];

      const menu = Menu.buildFromTemplate(template);

      console.log("menu", menu);

      menu.popup();
      // menu.popup({ x: 100, y: 200 }); // use this later
    },
  );
}
