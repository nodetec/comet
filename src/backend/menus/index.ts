import contextMenu from "electron-context-menu";

import { setupNotebookContextMenu } from "./notebookContextMenu";
import { setupNoteCardContextMenu } from "./noteCardContextMenu";
import { setupTrashNoteCardContextMenu } from "./trashNoteCardContextMenu";

export function setupContextMenus() {
  setupNoteCardContextMenu();
  setupTrashNoteCardContextMenu();
  setupNotebookContextMenu();
  contextMenu({
    showInspectElement: false,
  });
}
