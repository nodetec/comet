import contextMenu from "electron-context-menu";

import { setupNotebookContextMenu } from "./notebookContextMenu";
import { setupNoteCardContextMenu } from "./noteCardContextMenu";
import { setupTrashNoteCardContextMenu } from "./trashNoteCardContextMenu";

export function setupContextMenus() {
  setupNoteCardContextMenu();
  setupTrashNoteCardContextMenu();
  setupNotebookContextMenu();

  // Only setup default context menu if not on Linux
  if (process.platform !== "linux") {
    contextMenu({
      showInspectElement: false,
    });
  }
}
