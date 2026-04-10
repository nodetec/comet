import { type KeyboardEvent, type MouseEvent } from "react";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Menu } from "@tauri-apps/api/menu";
import {
  Archive,
  CalendarDays,
  CheckSquare,
  Square,
  ChevronRight,
  FileTextIcon,
  Inbox,
  Pin,
  Trash2,
} from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { type NoteFilter } from "@/shared/api/types";
import {
  SIDEBAR_ITEM_ICON_CLASS_NAME,
  sidebarItemClasses,
} from "@/features/shell/ui/sidebar-utils";
import {
  SidebarCollapse,
  SidebarIndentedContent,
  SidebarRowContent,
} from "@/features/shell/ui/sidebar-shared";

function isSidebarFilterActive(
  filter: NoteFilter,
  noteFilter: NoteFilter,
  noteSectionHasActiveTag: boolean,
) {
  return noteFilter === filter && !noteSectionHasActiveTag;
}

async function showTrashContextMenu(
  event: MouseEvent<HTMLButtonElement>,
  onEmptyTrash: () => void,
) {
  event.preventDefault();
  const menu = await Menu.new({
    items: [
      { id: "empty-trash", text: "Empty Trash", action: () => onEmptyTrash() },
    ],
  });
  try {
    await menu.popup(new LogicalPosition(event.clientX, event.clientY));
  } finally {
    await menu.close();
  }
}

/**
 * Prevent the native button Enter/Space → click behavior so that the
 * parent `<nav>` keyboard handler controls focus transitions exclusively.
 * Without this, pressing Enter on a filter button fires both the nav
 * handler (which focuses the notes pane) and the button's synthetic
 * click (which re-selects the filter and sets focus back to sidebar).
 */
function preventButtonKeyboardClick(event: KeyboardEvent<HTMLButtonElement>) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
  }
}

export function NotesSection({
  archivedCount,
  isFocused,
  noteFilter,
  noteSectionHasActiveTag,
  notesChildrenOpen,
  onEmptyTrash,
  onRowRef,
  onSidebarRowFocus,
  onSelectAll,
  onSelectArchive,
  onSelectToday,
  onSelectTodo,
  onSelectPinned,
  onSelectUntagged,
  onSelectTrash,
  onToggleNotesChildren,
  todoCount,
  trashedCount,
}: {
  archivedCount: number;
  isFocused: boolean;
  noteFilter: NoteFilter;
  noteSectionHasActiveTag: boolean;
  notesChildrenOpen: boolean;
  onEmptyTrash: () => void;
  onRowRef: (itemId: string, element: HTMLElement | null) => void;
  onSidebarRowFocus: () => void;
  onSelectAll: () => void;
  onSelectArchive: () => void;
  onSelectToday: () => void;
  onSelectTodo: () => void;
  onSelectPinned: () => void;
  onSelectUntagged: () => void;
  onSelectTrash: () => void;
  onToggleNotesChildren: () => void;
  todoCount: number;
  trashedCount: number;
}) {
  const isAllActive = isSidebarFilterActive(
    "all",
    noteFilter,
    noteSectionHasActiveTag,
  );
  const isTodayActive = isSidebarFilterActive(
    "today",
    noteFilter,
    noteSectionHasActiveTag,
  );
  const isTodoActive = isSidebarFilterActive(
    "todo",
    noteFilter,
    noteSectionHasActiveTag,
  );
  const isPinnedActive = isSidebarFilterActive(
    "pinned",
    noteFilter,
    noteSectionHasActiveTag,
  );
  const isUntaggedActive = isSidebarFilterActive(
    "untagged",
    noteFilter,
    noteSectionHasActiveTag,
  );
  const isArchiveActive = isSidebarFilterActive(
    "archive",
    noteFilter,
    noteSectionHasActiveTag,
  );
  const isTrashActive = isSidebarFilterActive(
    "trash",
    noteFilter,
    noteSectionHasActiveTag,
  );
  const showArchive = archivedCount > 0 || noteFilter === "archive";
  const showTrash = trashedCount > 0 || noteFilter === "trash";
  const handleTrashContextMenu = (event: MouseEvent<HTMLButtonElement>) => {
    showTrashContextMenu(event, onEmptyTrash).catch(() => {});
  };

  return (
    <section className="flex flex-col gap-0.5">
      <div className="flex flex-col gap-0.5">
        <div
          className={sidebarItemClasses(isAllActive, isFocused)}
          data-comet-sidebar-active={isAllActive ? "true" : undefined}
          onClick={onSelectAll}
          onFocus={onSidebarRowFocus}
          ref={(element) => onRowRef("filter:all", element)}
          tabIndex={-1}
        >
          <SidebarRowContent
            chevron={
              <button
                className="flex size-5 items-center justify-center rounded-sm"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleNotesChildren();
                }}
                type="button"
              >
                <ChevronRight
                  className={cn(
                    "size-4 transition-transform",
                    notesChildrenOpen ? "rotate-90" : "rotate-0",
                  )}
                />
              </button>
            }
            icon={<FileTextIcon className={SIDEBAR_ITEM_ICON_CLASS_NAME} />}
            label="Notes"
          />
        </div>
        <SidebarCollapse open={notesChildrenOpen}>
          <div className="flex flex-col gap-0.5">
            <button
              className={sidebarItemClasses(isTodayActive, isFocused)}
              onClick={onSelectToday}
              onFocus={onSidebarRowFocus}
              onKeyDown={preventButtonKeyboardClick}
              ref={(element) => onRowRef("filter:today", element)}
              data-comet-sidebar-active={isTodayActive ? "true" : undefined}
              type="button"
            >
              <SidebarIndentedContent indentLevel={1}>
                <SidebarRowContent
                  icon={
                    <CalendarDays className={SIDEBAR_ITEM_ICON_CLASS_NAME} />
                  }
                  label="Today"
                />
              </SidebarIndentedContent>
            </button>
            <button
              className={sidebarItemClasses(isTodoActive, isFocused)}
              onClick={onSelectTodo}
              onFocus={onSidebarRowFocus}
              onKeyDown={preventButtonKeyboardClick}
              ref={(element) => onRowRef("filter:todo", element)}
              data-comet-sidebar-active={isTodoActive ? "true" : undefined}
              type="button"
            >
              <SidebarIndentedContent indentLevel={1}>
                <SidebarRowContent
                  icon={
                    todoCount > 0 ? (
                      <Square className={SIDEBAR_ITEM_ICON_CLASS_NAME} />
                    ) : (
                      <CheckSquare className={SIDEBAR_ITEM_ICON_CLASS_NAME} />
                    )
                  }
                  label="Todo"
                />
              </SidebarIndentedContent>
            </button>
            <button
              className={sidebarItemClasses(isPinnedActive, isFocused)}
              onClick={onSelectPinned}
              onFocus={onSidebarRowFocus}
              onKeyDown={preventButtonKeyboardClick}
              ref={(element) => onRowRef("filter:pinned", element)}
              data-comet-sidebar-active={isPinnedActive ? "true" : undefined}
              type="button"
            >
              <SidebarIndentedContent indentLevel={1}>
                <SidebarRowContent
                  icon={<Pin className={SIDEBAR_ITEM_ICON_CLASS_NAME} />}
                  label="Pinned"
                />
              </SidebarIndentedContent>
            </button>
            <button
              className={sidebarItemClasses(isUntaggedActive, isFocused)}
              onClick={onSelectUntagged}
              onFocus={onSidebarRowFocus}
              onKeyDown={preventButtonKeyboardClick}
              ref={(element) => onRowRef("filter:untagged", element)}
              data-comet-sidebar-active={isUntaggedActive ? "true" : undefined}
              type="button"
            >
              <SidebarIndentedContent indentLevel={1}>
                <SidebarRowContent
                  icon={<Inbox className={SIDEBAR_ITEM_ICON_CLASS_NAME} />}
                  label="Untagged"
                />
              </SidebarIndentedContent>
            </button>
          </div>
        </SidebarCollapse>
      </div>
      {showArchive && (
        <button
          className={sidebarItemClasses(isArchiveActive, isFocused)}
          onClick={onSelectArchive}
          onFocus={onSidebarRowFocus}
          onKeyDown={preventButtonKeyboardClick}
          ref={(element) => onRowRef("filter:archive", element)}
          data-comet-sidebar-active={isArchiveActive ? "true" : undefined}
          type="button"
        >
          <SidebarRowContent
            icon={<Archive className={SIDEBAR_ITEM_ICON_CLASS_NAME} />}
            label="Archive"
          />
        </button>
      )}
      {showTrash && (
        <button
          className={sidebarItemClasses(isTrashActive, isFocused)}
          onClick={onSelectTrash}
          onContextMenu={(event) => handleTrashContextMenu(event)}
          onFocus={onSidebarRowFocus}
          onKeyDown={preventButtonKeyboardClick}
          ref={(element) => onRowRef("filter:trash", element)}
          data-comet-sidebar-active={isTrashActive ? "true" : undefined}
          type="button"
        >
          <SidebarRowContent
            icon={<Trash2 className={SIDEBAR_ITEM_ICON_CLASS_NAME} />}
            label="Trash"
          />
        </button>
      )}
    </section>
  );
}
