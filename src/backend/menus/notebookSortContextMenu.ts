import { updateNotebook } from "&/api";
import type { Notebook } from "$/types/Notebook";
import { ipcMain, Menu, type MenuItemConstructorOptions } from "electron";

export function setupNotebookSortContextMenu() {
  ipcMain.on(
    "notebookSortContextMenu",
    (event, notebook: Notebook, x?: number, y?: number) => {
      const getCurrentSortOrder = () => {
        switch (notebook.sortBy) {
          case "createdAt":
            return notebook.createdAtSortOrder;
          case "editedAt":
            return notebook.editedAtSortOrder;
          case "title":
            return notebook.titleSortOrder;
        }
      };

      const template: MenuItemConstructorOptions[] = [
        {
          label: "Sort By",
          submenu: [
            {
              label: "Date Edited",
              type: "checkbox",
              checked: notebook.sortBy === "editedAt",
              click: () => {
                void updateNotebook(event, {
                  _id: notebook._id,
                  sortBy: "editedAt",
                }).then((updatedNotebook) => {
                  if (updatedNotebook) {
                    event.sender.send(
                      "notebookSortSettingsUpdated",
                      updatedNotebook,
                    );
                  }
                });
              },
            },
            {
              label: "Date Created",
              type: "checkbox",
              checked: notebook.sortBy === "createdAt",
              click: () => {
                void updateNotebook(event, {
                  _id: notebook._id,
                  sortBy: "createdAt",
                }).then((updatedNotebook) => {
                  if (updatedNotebook) {
                    event.sender.send(
                      "notebookSortSettingsUpdated",
                      updatedNotebook,
                    );
                  }
                });
              },
            },
            {
              label: "Title",
              type: "checkbox",
              checked: notebook.sortBy === "title",
              click: () => {
                void updateNotebook(event, {
                  _id: notebook._id,
                  sortBy: "title",
                }).then((updatedNotebook) => {
                  if (updatedNotebook) {
                    event.sender.send(
                      "notebookSortSettingsUpdated",
                      updatedNotebook,
                    );
                  }
                });
              },
            },
            { type: "separator" },

            {
              label: notebook.sortBy === "title" ? "A to Z" : "Newest First",
              type: "checkbox",
              checked:
                getCurrentSortOrder() ===
                (notebook.sortBy === "title" ? "asc" : "desc"),
              click: () => {
                const update: Partial<Notebook> = {
                  _id: notebook._id,
                };
                switch (notebook.sortBy) {
                  case "createdAt":
                    update.createdAtSortOrder = "desc";
                    break;
                  case "editedAt":
                    update.editedAtSortOrder = "desc";
                    break;
                  case "title":
                    update.titleSortOrder = "asc";
                    break;
                }
                void updateNotebook(event, update).then((updatedNotebook) => {
                  if (updatedNotebook) {
                    event.sender.send(
                      "notebookSortSettingsUpdated",
                      updatedNotebook,
                    );
                  }
                });
              },
            },

            {
              label: notebook.sortBy === "title" ? "Z to A" : "Oldest First",
              type: "checkbox",
              checked:
                getCurrentSortOrder() ===
                (notebook.sortBy === "title" ? "desc" : "asc"),
              click: () => {
                const update: Partial<Notebook> = {
                  _id: notebook._id,
                };
                switch (notebook.sortBy) {
                  case "createdAt":
                    update.createdAtSortOrder = "asc";
                    break;
                  case "editedAt":
                    update.editedAtSortOrder = "asc";
                    break;
                  case "title":
                    update.titleSortOrder = "desc";
                    break;
                }
                void updateNotebook(event, update).then((updatedNotebook) => {
                  if (updatedNotebook) {
                    event.sender.send(
                      "notebookSortSettingsUpdated",
                      updatedNotebook,
                    );
                  }
                });
              },
            },
          ],
        },
      ];

      const menu = Menu.buildFromTemplate(template);
      menu.popup({
        x,
        y,
      });
    },
  );
}
