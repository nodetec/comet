import contextMenu from "electron-context-menu";

import { setupNotebookContextMenu } from "./notebookContextMenu";
import { setupNoteCardContextMenu } from "./noteCardContextMenu";
import { setupSortContextMenu } from "./sortContextMenu";
import { setupNotebookSortContextMenu } from "./notebookSortContextMenu";
import { setupTrashNoteCardContextMenu } from "./trashNoteCardContextMenu";

export function setupContextMenus() {
  setupNoteCardContextMenu();
  setupNotebookContextMenu();
  setupTrashNoteCardContextMenu();
  setupSortContextMenu();
  setupNotebookSortContextMenu();

  // Only setup default context menu if not on Linux
  if (process.platform !== "linux") {
    contextMenu({
      showInspectElement: false,
    });
  }
}
