import { getSortSettings, updateSortSettings } from "&/api";
import { ipcMain, Menu, type MenuItemConstructorOptions } from "electron";

export function setupSortContextMenu() {
  ipcMain.on("sortContextMenu", (event) => {
    const sortSettings = getSortSettings();

    const template: MenuItemConstructorOptions[] = [
      {
        label: "Sort By",
        submenu: [
          {
            label: "Title",
            type: "checkbox",
            checked: sortSettings.sortBy === "title",
            click: () => {
              void updateSortSettings(event, "title", sortSettings.sortOrder);
            },
          },
          {
            label: "Created At",
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
            label: "Updated At",
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
        ],
      },
      {
        label: "Sort Order",
        submenu: [
          {
            label: "Ascending",
            type: "checkbox",
            checked: sortSettings.sortOrder === "asc",
            click: () => {
              void updateSortSettings(event, sortSettings.sortBy, "asc");
            },
          },
          {
            label: "Descending",
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
    menu.popup();
  });
}
