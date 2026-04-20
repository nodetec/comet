import { format } from "date-fns";
import type { LogicalPosition } from "@tauri-apps/api/dpi";
import { CheckMenuItem, Menu, Submenu } from "@tauri-apps/api/menu";
export const TOOLBAR_ENTER_ANIMATION = {
  damping: 28,
  mass: 0.8,
  stiffness: 360,
  type: "spring" as const,
};
export const TOOLBAR_EXIT_ANIMATION = {
  duration: 0.16,
  ease: [0.4, 0, 1, 1] as const,
};

// eslint-disable-next-line sonarjs/slow-regex -- bounded by single-line input
const H1_TITLE_RE = /^#\s+(.+?)\s*$/;

export type EditorMenuContext = {
  readonly: boolean;
  isPublishedNote: boolean;
  isDeletePublishedNotePending: boolean;
  pinnedAt: number | null;
  publishedAt: number | null;
  onSetReadonly(readonly: boolean): void;
  onDeletePublishedNote(): void;
  onPublishShortNote(): void;
  onOpenPublishDialog(): void;
  onSetPinned(pinned: boolean): void;
  onDuplicateNote(): void;
  onOpenHistory(): void;
};

export async function buildEditorMenu(
  position: LogicalPosition,
  ctx: EditorMenuContext,
) {
  const readonlyMenuItem = await CheckMenuItem.new({
    id: "editor-menu-readonly",
    text: "Read-only",
    checked: ctx.readonly,
    enabled: !ctx.isPublishedNote,
    action: () => ctx.onSetReadonly(!ctx.readonly),
  });

  const deletePublishedItem = {
    id: "editor-menu-delete-published",
    text: "Delete from Nostr",
    enabled: !ctx.isDeletePublishedNotePending,
    action: ctx.onDeletePublishedNote,
  };

  let publishItems;
  if (ctx.isPublishedNote) {
    publishItems = [deletePublishedItem];
  } else {
    const publishAsSubmenu = await Submenu.new({
      text: ctx.publishedAt ? "Update on Nostr" : "Publish As",
      items: [
        {
          id: "editor-menu-publish-note",
          text: "Note",
          action: () => ctx.onPublishShortNote(),
        },
        {
          id: "editor-menu-publish-article",
          text: "Article",
          action: () => ctx.onOpenPublishDialog(),
        },
      ],
    });
    publishItems = ctx.publishedAt
      ? [publishAsSubmenu, deletePublishedItem]
      : [publishAsSubmenu];
  }

  const menu = await Menu.new({
    items: [
      {
        id: ctx.pinnedAt ? "editor-menu-unpin" : "editor-menu-pin",
        text: ctx.pinnedAt ? "Unpin" : "Pin To Top",
        action: () => ctx.onSetPinned(!ctx.pinnedAt),
      },
      readonlyMenuItem,
      {
        id: "editor-menu-duplicate",
        text: "Duplicate",
        action: ctx.onDuplicateNote,
      },
      {
        id: "editor-menu-history",
        text: "View History",
        action: ctx.onOpenHistory,
      },
      ...publishItems,
    ],
  });

  try {
    await menu.popup(position);
  } finally {
    await menu.close();
  }
}

export function firstLineH1Title(markdown: string) {
  const [firstLine = ""] = markdown.split("\n", 1);
  const match = H1_TITLE_RE.exec(firstLine);
  return match?.[1] ?? null;
}

export function formatConflictHeadTimestamp(mtime: number) {
  return format(mtime, "MMM d, yyyy 'at' h:mm a");
}

export function isEditableElement(element: EventTarget | null) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (element.closest(".cm-editor")) {
    return true;
  }

  const tagName = element.tagName;
  return (
    element.isContentEditable ||
    tagName === "INPUT" ||
    tagName === "SELECT" ||
    tagName === "TEXTAREA"
  );
}
