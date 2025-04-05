import { getSortSettings, updateSortSettings } from "&/api";
import { ipcMain, Menu, type MenuItemConstructorOptions } from "electron";

export function setupSortContextMenu() {
  ipcMain.on("sortContextMenu", (event, x?: number, y?: number) => {
    const sortSettings = getSortSettings();

    const template: MenuItemConstructorOptions[] = [
      {
        label: "Sort By",
        submenu: [
          {
            label: "Date Edited",
            type: "checkbox",
            checked: sortSettings.sortBy === "contentUpdatedAt",
            click: () => {
              void updateSortSettings(
                event,
                "contentUpdatedAt",
                sortSettings.sortOrder,
              );
            },
          },
          {
            label: "Date Created",
            type: "checkbox",
            checked: sortSettings.sortBy === "createdAt",
            click: () => {
              void updateSortSettings(
                event,
                "createdAt",
                sortSettings.sortOrder,
              );
            },
          },
          {
            label: "Title",
            type: "checkbox",
            checked: sortSettings.sortBy === "title",
            click: () => {
              void updateSortSettings(event, "title", sortSettings.sortOrder);
            },
          },
          { type: "separator" },
          {
            label: sortSettings.sortBy === "title" ? "A to Z" : "Oldest First",
            type: "checkbox",
            checked: sortSettings.sortOrder === "asc",
            click: () => {
              void updateSortSettings(event, sortSettings.sortBy, "asc");
            },
          },

          {
            label: sortSettings.sortBy === "title" ? "Z to A" : "Newest First",
            type: "checkbox",
            checked: sortSettings.sortOrder === "desc",
            click: () => {
              void updateSortSettings(event, sortSettings.sortBy, "desc");
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
  });
}
