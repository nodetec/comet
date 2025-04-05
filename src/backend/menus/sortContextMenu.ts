import { getSortSettings, updateSortSettings } from "&/api";
import { ipcMain, Menu, type MenuItemConstructorOptions } from "electron";

export function setupSortContextMenu() {
  ipcMain.on("sortContextMenu", (event, x?: number, y?: number) => {
    const sortSettings = getSortSettings();

    const getCurrentSortOrder = () => {
      switch (sortSettings.sortBy) {
        case "createdAt":
          return sortSettings.createdAtSortOrder;
        case "editedAt":
          return sortSettings.editedAtSortOrder;
        case "title":
          return sortSettings.titleSortOrder;
      }
    };

    const template: MenuItemConstructorOptions[] = [
      {
        label: "Sort By",
        submenu: [
          {
            label: "Date Edited",
            type: "checkbox",
            checked: sortSettings.sortBy === "editedAt",
            click: () => {
              void updateSortSettings(
                event,
                "editedAt",
                sortSettings.editedAtSortOrder,
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
                sortSettings.createdAtSortOrder,
              );
            },
          },
          {
            label: "Title",
            type: "checkbox",
            checked: sortSettings.sortBy === "title",
            click: () => {
              void updateSortSettings(
                event,
                "title",
                sortSettings.titleSortOrder,
              );
            },
          },
          { type: "separator" },
          {
            label: sortSettings.sortBy === "title" ? "A to Z" : "Newest First",
            type: "checkbox",
            checked:
              getCurrentSortOrder() ===
              (sortSettings.sortBy === "title" ? "asc" : "desc"),
            click: () => {
              void updateSortSettings(
                event,
                sortSettings.sortBy,
                sortSettings.sortBy === "title" ? "asc" : "desc",
              );
            },
          },
          {
            label: sortSettings.sortBy === "title" ? "Z to A" : "Oldest First",
            type: "checkbox",
            checked:
              getCurrentSortOrder() ===
              (sortSettings.sortBy === "title" ? "desc" : "asc"),
            click: () => {
              void updateSortSettings(
                event,
                sortSettings.sortBy,
                sortSettings.sortBy === "title" ? "desc" : "asc",
              );
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
