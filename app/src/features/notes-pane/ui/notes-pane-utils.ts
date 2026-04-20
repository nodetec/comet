import { type MouseEvent, type PointerEvent } from "react";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import {
  CheckMenuItem,
  Menu,
  PredefinedMenuItem,
  Submenu,
} from "@tauri-apps/api/menu";

import { useNavigationStore } from "@/shared/stores/use-navigation-store";
import {
  type NoteFilter,
  type NoteSortDirection,
  type NoteSortField,
  type NoteSummary,
} from "@/shared/api/types";

export const HIGHLIGHT_CLASS_NAME =
  "bg-search-match text-search-match-foreground rounded-[3px] px-[0.08rem] [box-decoration-break:clone] [-webkit-box-decoration-break:clone]";
export const MAX_HIGHLIGHT_MATCHES_PER_BLOCK = 24;

export function notesHeading(
  noteFilter: NoteFilter,
  activeTagPath: string | null,
) {
  if (activeTagPath) {
    return {
      label: activeTagPath,
      showTagIcon: true,
    };
  }

  if (noteFilter === "archive") {
    return { label: "Archive", showTagIcon: false };
  }

  if (noteFilter === "trash") {
    return { label: "Trash", showTagIcon: false };
  }

  if (noteFilter === "today") {
    return { label: "Today", showTagIcon: false };
  }

  if (noteFilter === "pinned") {
    return { label: "Pinned", showTagIcon: false };
  }

  if (noteFilter === "untagged") {
    return { label: "Untagged", showTagIcon: false };
  }

  return { label: "Notes", showTagIcon: false };
}

export function normalizeHighlightWords(searchWords: string[]) {
  return (
    searchWords
      .map((word) => word.toLocaleLowerCase())
      .filter(Boolean)
      // eslint-disable-next-line unicorn/no-array-sort -- app tsconfig targets ES2020, so toSorted() is unavailable here
      .sort((left, right) => right.length - left.length)
  );
}

export function findNextHighlightMatch(
  lowerText: string,
  cursor: number,
  highlightWords: string[],
): { index: number; length: number } {
  let nextIndex = -1;
  let nextLength = 0;
  for (const word of highlightWords) {
    const index = lowerText.indexOf(word, cursor);
    if (index === -1) continue;
    if (
      nextIndex === -1 ||
      index < nextIndex ||
      (index === nextIndex && word.length > nextLength)
    ) {
      nextIndex = index;
      nextLength = word.length;
    }
  }
  return { index: nextIndex, length: nextLength };
}

export function noteCardPreview(note: NoteSummary, searchWords: string[]) {
  const fallback = note.title ? "" : "No content yet";
  if (searchWords.length > 0) {
    return note.searchSnippet || note.preview || fallback;
  }
  return note.preview || fallback;
}

export function noteRowClassName(params: {
  focusedPane: "sidebar" | "notes" | "editor";
  isActive: boolean;
  isSearchFocused: boolean;
}) {
  const { focusedPane, isActive, isSearchFocused } = params;
  return [
    "relative flex h-[6.75rem] w-full cursor-default flex-col items-start gap-2 overflow-hidden rounded-md px-3 py-2.5 text-left text-sm outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0",
    isActive ? "bg-accent/50" : "",
    isActive && focusedPane === "notes" && !isSearchFocused
      ? "before:bg-note-focus-indicator before:absolute before:inset-y-0 before:left-0 before:w-[5px]"
      : "",
  ].join(" ");
}

export function handleNoteRowPointerDown(
  event: PointerEvent<HTMLButtonElement>,
) {
  if (event.button !== 0) {
    return;
  }

  event.preventDefault();
  window.getSelection()?.removeAllRanges();
  event.currentTarget.focus({ preventScroll: true });
}

export function focusSelectedNoteRow(root?: ParentNode | null) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (useNavigationStore.getState().focusedPane !== "notes") {
        return;
      }

      const selectedRow = (root ?? document).querySelector<HTMLButtonElement>(
        '[data-comet-selected-note="true"]',
      );
      if (!selectedRow) {
        return;
      }

      selectedRow.scrollIntoView({ block: "nearest" });
      selectedRow.focus({ preventScroll: true });
    });
  });
}

export function focusNotesPaneTarget(scrollContainer: HTMLDivElement | null) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (useNavigationStore.getState().focusedPane !== "notes") {
        return;
      }

      const selectedRow = scrollContainer?.querySelector<HTMLButtonElement>(
        '[data-comet-selected-note="true"]',
      );
      if (selectedRow) {
        selectedRow.scrollIntoView({ block: "nearest" });
        selectedRow.focus({ preventScroll: true });
      }
    });
  });
}

export function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName;
  return (
    target.isContentEditable ||
    tagName === "INPUT" ||
    tagName === "SELECT" ||
    tagName === "TEXTAREA"
  );
}

export async function showNoteSortMenu(
  event: React.MouseEvent<HTMLButtonElement>,
  ctx: {
    sortField: NoteSortField;
    sortDirection: NoteSortDirection;
    totalNoteCount: number;
    onChangeSortField: (field: NoteSortField) => void;
    onChangeSortDirection: (direction: NoteSortDirection) => void;
    onExportNotes: () => void;
  },
) {
  const rect = event.currentTarget.getBoundingClientRect();
  const isDateField = ctx.sortField !== "title";
  const newestLabel = isDateField ? "Newest First" : "A to Z";
  const oldestLabel = isDateField ? "Oldest First" : "Z to A";

  const sortSubmenu = await Submenu.new({
    text: "Sort By",
    items: [
      await CheckMenuItem.new({
        id: "sort-modified_at",
        text: "Modification Date",
        checked: ctx.sortField === "modified_at",
        action: () => ctx.onChangeSortField("modified_at"),
      }),
      await CheckMenuItem.new({
        id: "sort-created_at",
        text: "Creation Date",
        checked: ctx.sortField === "created_at",
        action: () => ctx.onChangeSortField("created_at"),
      }),
      await CheckMenuItem.new({
        id: "sort-title",
        text: "Title",
        checked: ctx.sortField === "title",
        action: () => ctx.onChangeSortField("title"),
      }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await CheckMenuItem.new({
        id: "dir-newest",
        text: newestLabel,
        checked: ctx.sortDirection === "newest",
        action: () => ctx.onChangeSortDirection("newest"),
      }),
      await CheckMenuItem.new({
        id: "dir-oldest",
        text: oldestLabel,
        checked: ctx.sortDirection === "oldest",
        action: () => ctx.onChangeSortDirection("oldest"),
      }),
    ],
  });

  const noteCountLabel = `${ctx.totalNoteCount} ${ctx.totalNoteCount === 1 ? "note" : "notes"}`;
  const menu = await Menu.new({
    items: [
      { id: "note-count", text: noteCountLabel, enabled: false },
      await PredefinedMenuItem.new({ item: "Separator" }),
      sortSubmenu,
      await PredefinedMenuItem.new({ item: "Separator" }),
      {
        id: "export-notes",
        text: "Export as Markdown\u2026",
        action: () => ctx.onExportNotes(),
      },
    ],
  });

  try {
    await menu.popup(new LogicalPosition(rect.left, rect.bottom));
  } finally {
    await menu.close();
  }
}

export async function showNoteContextMenu(
  event: MouseEvent<HTMLButtonElement>,
  note: NoteSummary,
  ctx: {
    isArchive: boolean;
    isTrash: boolean;
    onSetNotePinned: (noteId: string, pinned: boolean) => void;
    onCopyNoteContent: (noteId: string) => void;
    onDeleteNotePermanently: (noteId: string) => void;
    onRestoreFromTrash: (noteId: string) => void;
    onTrashNote: (noteId: string) => void;
    onArchiveNote: (noteId: string) => void;
    onRestoreNote: (noteId: string) => void;
    onSetNoteReadonly: (noteId: string, readonly: boolean) => void;
    onDuplicateNote: (noteId: string) => void;
  },
) {
  event.preventDefault();

  const menu = await Menu.new({
    items: [
      {
        id: `${note.pinnedAt ? "unpin" : "pin"}-${note.id}`,
        text: note.pinnedAt ? "Unpin" : "Pin To Top",
        action: () => ctx.onSetNotePinned(note.id, !note.pinnedAt),
      },
      {
        id: `copy-${note.id}`,
        text: "Copy",
        action: () => ctx.onCopyNoteContent(note.id),
      },
      { item: "Separator" as const },
      ...(ctx.isTrash
        ? [
            {
              id: `delete-forever-${note.id}`,
              text: "Delete",
              action: () => ctx.onDeleteNotePermanently(note.id),
            },
            {
              id: `restore-trash-${note.id}`,
              text: "Restore",
              action: () => ctx.onRestoreFromTrash(note.id),
            },
          ]
        : [
            {
              id: `delete-${note.id}`,
              text: "Delete",
              action: () => ctx.onTrashNote(note.id),
            },
            {
              id: `restore-trash-${note.id}`,
              text: "Restore",
              enabled: false,
            },
          ]),
      { item: "Separator" as const },
      ...(ctx.isArchive
        ? [
            {
              id: `archive-${note.id}`,
              text: "Archive",
              enabled: false,
            },
            {
              id: `unarchive-${note.id}`,
              text: "Unarchive",
              action: () => ctx.onRestoreNote(note.id),
            },
          ]
        : [
            {
              id: `archive-${note.id}`,
              text: "Archive",
              enabled: !ctx.isTrash,
              action: () => ctx.onArchiveNote(note.id),
            },
            {
              id: `unarchive-${note.id}`,
              text: "Unarchive",
              enabled: false,
            },
          ]),
      { item: "Separator" as const },
      await CheckMenuItem.new({
        id: `readonly-${note.id}`,
        text: "Read-only",
        checked: note.readonly,
        action: () => ctx.onSetNoteReadonly(note.id, !note.readonly),
      }),
      {
        id: `duplicate-${note.id}`,
        text: "Duplicate",
        action: () => ctx.onDuplicateNote(note.id),
      },
    ],
  });

  try {
    await menu.popup(new LogicalPosition(event.clientX, event.clientY));
  } finally {
    await menu.close();
  }
}
