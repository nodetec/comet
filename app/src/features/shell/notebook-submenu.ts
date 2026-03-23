import { Submenu } from "@tauri-apps/api/menu";

import { type NotebookRef, type NotebookSummary } from "@/shared/api/types";

export async function buildNotebookSubmenu(opts: {
  currentNotebook: NotebookRef | null;
  notebooks: NotebookSummary[];
  idPrefix: string;
  onAssign: (notebookId: string | null) => void;
}) {
  const { currentNotebook, notebooks, idPrefix, onAssign } = opts;

  const currentItems = currentNotebook
    ? [
        {
          id: `${idPrefix}-current-${currentNotebook.id}`,
          text: `Current: ${currentNotebook.name}`,
          enabled: false,
        },
        {
          id: `${idPrefix}-none`,
          text: "Remove from Notebook",
          action: () => onAssign(null),
        },
        { item: "Separator" as const },
      ]
    : [];

  const otherItems =
    notebooks.length > 0
      ? notebooks
          .filter((item) => item.id !== currentNotebook?.id)
          .map((item) => ({
            id: `${idPrefix}-${item.id}`,
            text: item.name,
            action: () => onAssign(item.id),
          }))
      : [
          {
            id: `${idPrefix}-empty`,
            text: "No notebooks yet",
            enabled: false,
          },
        ];

  return Submenu.new({
    text: "Move to Notebook",
    items: [...currentItems, ...otherItems],
  });
}
