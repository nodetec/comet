import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ask } from "@tauri-apps/plugin-dialog";
import { Menu } from "@tauri-apps/api/menu";
import { motion } from "framer-motion";
import {
  Archive,
  CalendarDays,
  CheckSquare,
  Square,
  ChevronRight,
  CloudAlert,
  CloudOff,
  CloudSync,
  CloudCheck,
  FileTextIcon,
  Hash,
  Inbox,
  Pin,
  Settings2,
  Trash2,
} from "lucide-react";

import { canonicalizeTagPath } from "@/features/editor/lib/tags";
import { getNoteListNavigationDirectionForKey } from "@/features/notes/lib/note-list-navigation";
import {
  flattenVisibleSidebarNavigationItems,
  getActiveSidebarNavigationItemId,
  getAdjacentSidebarNavigationItem,
  getSidebarCollapseAction,
  getSidebarExpandAction,
} from "@/features/shell/lib/sidebar-navigation";
import { Button } from "@/shared/ui/button";
import { dispatchFocusNotesPane } from "@/shared/lib/pane-navigation";
import { cn } from "@/shared/lib/utils";
import {
  DialogBackdrop,
  DialogDescription,
  DialogPopup,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { SyncDialog } from "@/features/sync";
import { useUIStore } from "@/features/settings/store/use-ui-store";
import { type ContextualTagNode, type NoteFilter } from "@/shared/api/types";
import { useShellStore } from "@/features/shell/store/use-shell-store";
import {
  FOCUS_TAG_PATH_EVENT,
  type FocusTagPathDetail,
} from "@/shared/lib/tag-navigation";

const SIDEBAR_CHILD_INDENT_PX = 12;
const SIDEBAR_ITEM_ICON_CLASS_NAME = "text-sidebar-item-icon size-4 shrink-0";
const SIDEBAR_TAG_ICON_CLASS_NAME = "text-sidebar-tag-icon size-4 shrink-0";
const SIDEBAR_ITEM_STATUS_ICON_CLASS_NAME =
  "text-sidebar-item-icon/80 size-3 shrink-0 fill-current";
const SIDEBAR_COLLAPSE_TRANSITION = {
  duration: 0.26,
  ease: [0.22, 1, 0.36, 1] as const,
};

function sidebarItemClasses(isActive: boolean, isFocused?: boolean) {
  let stateClass: string;
  if (isActive && isFocused) {
    stateClass = "bg-sidebar-active-focus";
  } else if (isActive) {
    stateClass = "bg-sidebar-muted/80";
  } else {
    stateClass = "";
  }
  return `text-sidebar-foreground flex w-full cursor-default items-center gap-3 rounded-md px-2.5 py-1 text-left text-sm outline-none ring-0 transition-colors focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 ${stateClass}`;
}

function SidebarIndentedContent({
  indentLevel,
  children,
}: {
  indentLevel: number;
  children: ReactNode;
}) {
  return (
    <div
      className="w-full"
      style={{ paddingLeft: `${indentLevel * SIDEBAR_CHILD_INDENT_PX}px` }}
    >
      {children}
    </div>
  );
}

function SidebarRowContent({
  chevron,
  icon,
  label,
  status,
}: {
  chevron?: ReactNode;
  icon?: ReactNode;
  label: ReactNode;
  status?: ReactNode;
}) {
  return (
    <div className="grid w-full min-w-0 grid-cols-[1.25rem_1rem_minmax(0,1fr)_1rem] items-center gap-3">
      <span className="flex size-5 shrink-0 items-center justify-center">
        {chevron}
      </span>
      <span className="flex size-4 shrink-0 items-center justify-center">
        {icon}
      </span>
      <span className="flex min-w-0 items-center leading-none">
        <span className="block min-w-0 translate-y-px truncate">{label}</span>
      </span>
      <span className="flex size-4 shrink-0 items-center justify-center">
        {status}
      </span>
    </div>
  );
}

function focusSidebarRow(element: HTMLElement | null) {
  if (!element) {
    return;
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      element.scrollIntoView({
        block: "nearest",
      });
      element.focus({ preventScroll: true });
    });
  });
}

function ancestorSidebarTagPaths(path: string) {
  const segments = path.split("/");
  const ancestors: string[] = [];

  for (let depth = 1; depth < segments.length; depth += 1) {
    ancestors.push(segments.slice(0, depth).join("/"));
  }

  return ancestors;
}

function SidebarCollapse({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  return (
    <motion.div
      animate={
        open
          ? {
              height: "auto",
              opacity: 1,
              visibility: "visible",
            }
          : {
              height: 0,
              opacity: 0,
              transitionEnd: {
                visibility: "hidden",
              },
            }
      }
      className="overflow-hidden"
      initial={false}
      style={{
        visibility: open ? "visible" : "hidden",
      }}
      transition={SIDEBAR_COLLAPSE_TRANSITION}
    >
      {children}
    </motion.div>
  );
}

function renameErrorMessage(input: string, normalizedTarget: string | null) {
  if (input.trim().length === 0) {
    return null;
  }

  if (normalizedTarget == null) {
    return "Enter a valid tag path.";
  }

  return null;
}

function resetRenameDialog(params: {
  setRenameDialogOpen: (open: boolean) => void;
  setRenameSourcePath: (path: string) => void;
  setRenameInputValue: (value: string) => void;
}) {
  params.setRenameDialogOpen(false);
  params.setRenameSourcePath("");
  params.setRenameInputValue("");
}

function submitRenameDialog(params: {
  event: { preventDefault(): void };
  renameHasChanged: boolean;
  normalizedRenameTarget: string | null;
  renameSourcePath: string;
  onRenameTag: (fromPath: string, toPath: string) => void;
  onClose: () => void;
}) {
  const {
    event,
    renameHasChanged,
    normalizedRenameTarget,
    renameSourcePath,
    onRenameTag,
    onClose,
  } = params;

  event.preventDefault();
  if (!renameHasChanged || !normalizedRenameTarget) {
    return;
  }

  onRenameTag(renameSourcePath, normalizedRenameTarget);
  onClose();
}

function useRenameInputFocus(
  renameDialogOpen: boolean,
  renameInputRef: RefObject<HTMLInputElement | null>,
) {
  useEffect(() => {
    if (!renameDialogOpen) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [renameDialogOpen, renameInputRef]);
}

function useSidebarBorders(params: {
  availableTagTreeLength: number;
  noteFilter: NoteFilter;
  scrollContainerRef: RefObject<HTMLElement | null>;
  footerSentinelRef: RefObject<HTMLDivElement | null>;
}) {
  const {
    availableTagTreeLength,
    noteFilter,
    scrollContainerRef,
    footerSentinelRef,
  } = params;
  const [showHeaderBorder, setShowHeaderBorder] = useState(false);
  const [showFooterBorder, setShowFooterBorder] = useState(false);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    setShowHeaderBorder((scrollContainer?.scrollTop ?? 0) > 0);
  }, [availableTagTreeLength, noteFilter, scrollContainerRef]);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    const footerSentinel = footerSentinelRef.current;
    if (!scrollContainer || !footerSentinel) {
      setShowFooterBorder(false);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowFooterBorder(!entry?.isIntersecting);
      },
      {
        root: scrollContainer,
        threshold: 1,
      },
    );

    observer.observe(footerSentinel);

    return () => {
      observer.disconnect();
    };
  }, [
    availableTagTreeLength,
    noteFilter,
    scrollContainerRef,
    footerSentinelRef,
  ]);

  return { showHeaderBorder, setShowHeaderBorder, showFooterBorder };
}

function usePersistedExpandedTagPaths(availableTagPaths: string[]) {
  const expandedSidebarTagPaths = useUIStore((s) => s.expandedSidebarTagPaths);
  const setExpandedSidebarTagPaths = useUIStore(
    (s) => s.setExpandedSidebarTagPaths,
  );

  const expandedTagPaths = useMemo(
    () => new Set(expandedSidebarTagPaths),
    [expandedSidebarTagPaths],
  );

  useEffect(() => {
    const nextExpandedTagPaths = expandedSidebarTagPaths.filter((path) =>
      availableTagPaths.includes(path),
    );

    if (nextExpandedTagPaths.length !== expandedSidebarTagPaths.length) {
      setExpandedSidebarTagPaths(nextExpandedTagPaths);
    }
  }, [availableTagPaths, expandedSidebarTagPaths, setExpandedSidebarTagPaths]);

  const toggleExpandedTagPath = (path: string) => {
    const next = new Set(expandedSidebarTagPaths);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    setExpandedSidebarTagPaths([...next]);
  };

  return { expandedTagPaths, toggleExpandedTagPath };
}

type SidebarPaneProps = {
  activeTagPath: string | null;
  availableTagPaths: string[];
  archivedCount: number;
  todoCount: number;
  trashedCount: number;
  availableTagTree: ContextualTagNode[];
  noteFilter: NoteFilter;
  onSelectAll(): void;
  onSelectToday(): void;
  onSelectTodo(): void;
  onSelectPinned(): void;
  onSelectUntagged(): void;
  onSelectArchive(): void;
  onSelectTrash(): void;
  onEmptyTrash(): void;
  onDeleteTag(path: string): void;
  onExportTag(path: string): void;
  onRenameTag(fromPath: string, toPath: string): void;
  onSetTagPinned(path: string, pinned: boolean): void;
  onSetTagHideSubtagNotes(path: string, hideSubtagNotes: boolean): void;
  onSelectTagPath(tagPath: string): void;
};

async function showTagContextMenu(
  event: MouseEvent<HTMLDivElement | HTMLButtonElement>,
  node: ContextualTagNode,
  ctx: {
    onDeleteTag(path: string): void;
    onExportTag(path: string): void;
    onOpenRenameTagDialog(path: string): void;
    onSetTagPinned(path: string, pinned: boolean): void;
  },
) {
  event.preventDefault();
  const isRootTag = !node.path.includes("/");

  const items: Array<
    { item: "Separator" } | { id: string; text: string; action: () => void }
  > = [];

  if (isRootTag) {
    items.push({
      id: `pin-${node.path}`,
      text: node.pinned ? "Unpin Tag" : "Pin Tag",
      action: () => ctx.onSetTagPinned(node.path, !node.pinned),
    });
  }

  items.push(
    {
      id: `rename-${node.path}`,
      text: "Rename Tag",
      action: () => ctx.onOpenRenameTagDialog(node.path),
    },
    {
      id: `export-${node.path}`,
      text: "Export Tag",
      action: () => ctx.onExportTag(node.path),
    },
    { item: "Separator" as const },
    {
      id: `delete-${node.path}`,
      text: "Delete Tag",
      action: () => {
        void (async () => {
          const confirmed = await ask(
            `Delete "${node.path}" from all matching notes?`,
            {
              title: "Delete Tag",
              kind: "warning",
              okLabel: "Delete",
              cancelLabel: "Cancel",
            },
          );
          if (confirmed) {
            ctx.onDeleteTag(node.path);
          }
        })();
      },
    },
  );

  const menu = await Menu.new({ items });

  try {
    await menu.popup(new LogicalPosition(event.clientX, event.clientY));
  } finally {
    await menu.close();
  }
}

function TagTree({
  activeTagPath,
  expandedTagPaths,
  isFocused,
  nodes,
  onDeleteTag,
  onExportTag,
  onOpenRenameTagDialog,
  onSetTagPinned,
  onToggleExpanded,
  onSelectTagPath,
  onSidebarRowFocus,
  onTagRowRef,
}: {
  activeTagPath: string | null;
  expandedTagPaths: Set<string>;
  isFocused: boolean;
  nodes: ContextualTagNode[];
  onDeleteTag(path: string): void;
  onExportTag(path: string): void;
  onOpenRenameTagDialog(path: string): void;
  onSetTagPinned(path: string, pinned: boolean): void;
  onToggleExpanded(path: string): void;
  onSelectTagPath(path: string): void;
  onSidebarRowFocus(): void;
  onTagRowRef(path: string, element: HTMLElement | null): void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {nodes.map((node) => {
        const isActive = activeTagPath === node.path;
        const hasChildren = node.children.length > 0;
        const isExpanded = expandedTagPaths.has(node.path);
        const indentLevel = Math.max(0, node.depth - 1);

        return (
          <div key={node.path}>
            <div
              className={cn(sidebarItemClasses(isActive, isFocused), "group")}
              data-comet-sidebar-active={isActive ? "true" : undefined}
              data-comet-sidebar-tag-path={node.path}
              onClick={() => onSelectTagPath(node.path)}
              onContextMenu={(event) =>
                void showTagContextMenu(event, node, {
                  onDeleteTag,
                  onExportTag,
                  onOpenRenameTagDialog,
                  onSetTagPinned,
                })
              }
              onFocus={onSidebarRowFocus}
              ref={(element) => onTagRowRef(node.path, element)}
              tabIndex={-1}
            >
              <SidebarIndentedContent indentLevel={indentLevel}>
                <SidebarRowContent
                  chevron={
                    hasChildren ? (
                      <button
                        className="flex size-5 items-center justify-center rounded-sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleExpanded(node.path);
                        }}
                        type="button"
                      >
                        <ChevronRight
                          className={cn(
                            "size-4 transition-transform",
                            isExpanded ? "rotate-90" : "rotate-0",
                          )}
                        />
                      </button>
                    ) : undefined
                  }
                  icon={
                    <Hash
                      className={cn(
                        "size-4 shrink-0",
                        isActive
                          ? "text-sidebar-foreground"
                          : SIDEBAR_TAG_ICON_CLASS_NAME,
                      )}
                    />
                  }
                  label={node.label}
                  status={
                    node.pinned ? (
                      <Pin className={SIDEBAR_ITEM_STATUS_ICON_CLASS_NAME} />
                    ) : undefined
                  }
                />
              </SidebarIndentedContent>
            </div>
            <SidebarCollapse open={hasChildren && isExpanded}>
              <TagTree
                activeTagPath={activeTagPath}
                expandedTagPaths={expandedTagPaths}
                isFocused={isFocused}
                nodes={node.children}
                onDeleteTag={onDeleteTag}
                onExportTag={onExportTag}
                onOpenRenameTagDialog={onOpenRenameTagDialog}
                onSetTagPinned={onSetTagPinned}
                onToggleExpanded={onToggleExpanded}
                onSelectTagPath={onSelectTagPath}
                onSidebarRowFocus={onSidebarRowFocus}
                onTagRowRef={onTagRowRef}
              />
            </SidebarCollapse>
          </div>
        );
      })}
    </div>
  );
}

function RenameTagDialog({
  open,
  renameError,
  renameHasChanged,
  renameInputRef,
  renameInputValue,
  renameSourcePath,
  onClose,
  onInputChange,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  renameError: string | null;
  renameHasChanged: boolean;
  renameInputRef: RefObject<HTMLInputElement | null>;
  renameInputValue: string;
  renameSourcePath: string;
  onClose: () => void;
  onInputChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: (event: { preventDefault(): void }) => void;
}) {
  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogPortal keepMounted={false}>
        <DialogBackdrop />
        <DialogPopup className="w-full max-w-md p-6">
          <DialogTitle className="text-base font-semibold">
            Rename Tag
          </DialogTitle>
          <DialogDescription className="mt-2">
            Rename <code>{renameSourcePath}</code> across all matching notes.
          </DialogDescription>
          <form className="mt-4 flex flex-col gap-4" onSubmit={onSubmit}>
            <label className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-xs font-medium">
                New Tag Path
              </span>
              <Input
                aria-invalid={renameError ? "true" : "false"}
                onChange={(event) => onInputChange(event.target.value)}
                ref={renameInputRef}
                value={renameInputValue}
              />
              {renameError ? (
                <span className="text-destructive text-xs">{renameError}</span>
              ) : null}
            </label>
            <div className="mt-2 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                disabled={!renameHasChanged || !!renameError}
                type="submit"
              >
                Rename
              </Button>
            </div>
          </form>
        </DialogPopup>
      </DialogPortal>
    </DialogRoot>
  );
}

function isSidebarFilterActive(
  filter: NoteFilter,
  noteFilter: NoteFilter,
  noteSectionHasActiveTag: boolean,
) {
  return noteFilter === filter && !noteSectionHasActiveTag;
}

function selectSidebarNavigationItem(params: {
  item: ReturnType<typeof getAdjacentSidebarNavigationItem>;
  onSelectAll: () => void;
  onSelectArchive: () => void;
  onSelectSidebarTagPath: (tagPath: string) => void;
  onSelectPinned: () => void;
  onSelectToday: () => void;
  onSelectTodo: () => void;
  onSelectTrash: () => void;
  onSelectUntagged: () => void;
}) {
  const {
    item,
    onSelectAll,
    onSelectArchive,
    onSelectSidebarTagPath,
    onSelectPinned,
    onSelectToday,
    onSelectTodo,
    onSelectTrash,
    onSelectUntagged,
  } = params;

  if (!item) {
    return;
  }

  if (item.kind === "tag") {
    onSelectSidebarTagPath(item.tagPath);
    return;
  }

  switch (item.filter) {
    case "all": {
      onSelectAll();
      break;
    }
    case "today": {
      onSelectToday();
      break;
    }
    case "todo": {
      onSelectTodo();
      break;
    }
    case "pinned": {
      onSelectPinned();
      break;
    }
    case "untagged": {
      onSelectUntagged();
      break;
    }
    case "archive": {
      onSelectArchive();
      break;
    }
    case "trash": {
      onSelectTrash();
      break;
    }
  }
}

function applySidebarCollapseAction(params: {
  action: ReturnType<typeof getSidebarCollapseAction>;
  onSelectAll: () => void;
  onSelectSidebarTagPath: (tagPath: string) => void;
  setNotesChildrenOpen: (open: boolean) => void;
  toggleExpandedTagPath: (path: string) => void;
}) {
  const {
    action,
    onSelectAll,
    onSelectSidebarTagPath,
    setNotesChildrenOpen,
    toggleExpandedTagPath,
  } = params;
  if (!action) {
    return;
  }

  if (action.kind === "collapse-notes") {
    setNotesChildrenOpen(false);
    onSelectAll();
    return;
  }

  toggleExpandedTagPath(action.tagPath);
  if (action.nextTagPath) {
    onSelectSidebarTagPath(action.nextTagPath);
  }
}

function applySidebarExpandAction(params: {
  action: ReturnType<typeof getSidebarExpandAction>;
  setNotesChildrenOpen: (open: boolean) => void;
  toggleExpandedTagPath: (path: string) => void;
}) {
  const { action, setNotesChildrenOpen, toggleExpandedTagPath } = params;
  if (!action) {
    return;
  }

  if (action.kind === "expand-notes") {
    setNotesChildrenOpen(true);
    return;
  }

  toggleExpandedTagPath(action.tagPath);
}

function NotesSection({
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

function useSyncState() {
  const [syncState, setSyncState] = useState<string>("disconnected");

  useEffect(() => {
    invoke<string | { error: { message: string } }>("get_sync_status")
      .then((s) => {
        setSyncState(typeof s === "string" ? s : "error");
      })
      .catch(() => {});
    const unlisten = listen<{ state: string | { error: { message: string } } }>(
      "sync-status",
      (event) => {
        const s = event.payload.state;
        setSyncState(typeof s === "string" ? s : "error");
      },
    );
    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, []);

  return syncState;
}

export function SidebarPane({
  activeTagPath,
  availableTagPaths,
  archivedCount,
  todoCount,
  trashedCount,
  availableTagTree,
  noteFilter,
  onSelectAll,
  onSelectToday,
  onSelectTodo,
  onSelectPinned,
  onSelectUntagged,
  onSelectArchive,
  onSelectTrash,
  onEmptyTrash,
  onDeleteTag,
  onExportTag,
  onRenameTag,
  onSetTagPinned,
  onSelectTagPath,
}: SidebarPaneProps) {
  const isFocused = useShellStore((s) => s.focusedPane === "sidebar");
  const setFocusedPane = useShellStore((s) => s.setFocusedPane);
  const openSettings = useUIStore((s) => s.setSettingsOpen);
  const notesChildrenOpen = useUIStore((s) => s.sidebarNotesChildrenOpen);
  const setNotesChildrenOpen = useUIStore((s) => s.setSidebarNotesChildrenOpen);
  const syncState = useSyncState();

  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameSourcePath, setRenameSourcePath] = useState("");
  const [renameInputValue, setRenameInputValue] = useState("");
  const [pendingScrollTagPath, setPendingScrollTagPath] = useState<
    string | null
  >(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const footerSentinelRef = useRef<HTMLDivElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const sidebarRowRefs = useRef(new Map<string, HTMLElement | null>());
  const { showHeaderBorder, setShowHeaderBorder, showFooterBorder } =
    useSidebarBorders({
      availableTagTreeLength: availableTagTree.length,
      noteFilter,
      scrollContainerRef,
      footerSentinelRef,
    });

  const normalizedRenameTarget = canonicalizeTagPath(renameInputValue.trim());
  const renameHasChanged =
    normalizedRenameTarget != null &&
    normalizedRenameTarget !== renameSourcePath;
  const renameError = renameErrorMessage(
    renameInputValue,
    normalizedRenameTarget,
  );
  const { expandedTagPaths, toggleExpandedTagPath } =
    usePersistedExpandedTagPaths(availableTagPaths);
  const expandedSidebarTagPaths = useUIStore((s) => s.expandedSidebarTagPaths);
  const setExpandedSidebarTagPaths = useUIStore(
    (s) => s.setExpandedSidebarTagPaths,
  );
  useRenameInputFocus(renameDialogOpen, renameInputRef);
  const noteSectionHasActiveTag = activeTagPath !== null;
  const sidebarNavigationItems = useMemo(
    () =>
      flattenVisibleSidebarNavigationItems({
        archivedCount,
        availableTagTree,
        expandedTagPaths,
        noteFilter,
        notesChildrenOpen,
        trashedCount,
      }),
    [
      archivedCount,
      availableTagTree,
      expandedTagPaths,
      noteFilter,
      notesChildrenOpen,
      trashedCount,
    ],
  );
  const activeSidebarItemId = useMemo(
    () =>
      getActiveSidebarNavigationItemId({
        activeTagPath,
        noteFilter,
      }),
    [activeTagPath, noteFilter],
  );

  useEffect(() => {
    const handleFocusTagPath = (event: Event) => {
      const customEvent = event as CustomEvent<FocusTagPathDetail>;
      const tagPath = canonicalizeTagPath(customEvent.detail?.tagPath ?? "");
      if (!tagPath || !availableTagPaths.includes(tagPath)) {
        return;
      }

      const nextExpanded = new Set(expandedSidebarTagPaths);
      for (const ancestor of ancestorSidebarTagPaths(tagPath)) {
        nextExpanded.add(ancestor);
      }
      setExpandedSidebarTagPaths([...nextExpanded]);
      setPendingScrollTagPath(tagPath);
    };

    window.addEventListener(FOCUS_TAG_PATH_EVENT, handleFocusTagPath);
    return () => {
      window.removeEventListener(FOCUS_TAG_PATH_EVENT, handleFocusTagPath);
    };
  }, [availableTagPaths, expandedSidebarTagPaths, setExpandedSidebarTagPaths]);

  useEffect(() => {
    if (!pendingScrollTagPath) {
      return;
    }

    const element = sidebarRowRefs.current.get(`tag:${pendingScrollTagPath}`);
    const scrollContainer = scrollContainerRef.current;
    if (!element || !scrollContainer) {
      return;
    }

    const elementRect = element.getBoundingClientRect();
    const containerRect = scrollContainer.getBoundingClientRect();
    const isFullyVisible =
      elementRect.top >= containerRect.top &&
      elementRect.bottom <= containerRect.bottom;

    if (!isFullyVisible) {
      element.scrollIntoView({ block: "center", behavior: "smooth" });
    }

    setPendingScrollTagPath(null);
  }, [expandedTagPaths, pendingScrollTagPath]);

  useEffect(() => {
    if (!isFocused || renameDialogOpen) {
      return;
    }

    focusSidebarRow(sidebarRowRefs.current.get(activeSidebarItemId) ?? null);
  }, [
    activeSidebarItemId,
    expandedTagPaths,
    isFocused,
    notesChildrenOpen,
    renameDialogOpen,
    sidebarNavigationItems,
  ]);

  const closeRenameDialog = () => {
    resetRenameDialog({
      setRenameDialogOpen,
      setRenameSourcePath,
      setRenameInputValue,
    });
  };

  const handleRenameDialogSubmit = (event: { preventDefault(): void }) => {
    submitRenameDialog({
      event,
      renameHasChanged,
      normalizedRenameTarget,
      renameSourcePath,
      onRenameTag,
      onClose: closeRenameDialog,
    });
  };

  const handleSelectSidebarTagPath = (tagPath: string) => {
    setPendingScrollTagPath(tagPath);
    onSelectTagPath(tagPath);
  };

  const handleSidebarRowFocus = () => {
    setFocusedPane("sidebar");
  };

  const handleSidebarKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    const lowerKey = event.key.toLowerCase();
    if (event.key === "Enter" || lowerKey === "o") {
      event.preventDefault();
      dispatchFocusNotesPane({ selection: "first" });
      return;
    }

    if (lowerKey === "h" || event.key === "ArrowLeft") {
      const collapseAction = getSidebarCollapseAction({
        activeTagPath,
        availableTagTree,
        expandedTagPaths,
        noteFilter,
        notesChildrenOpen,
      });
      if (!collapseAction) {
        return;
      }

      event.preventDefault();
      applySidebarCollapseAction({
        action: collapseAction,
        onSelectAll,
        onSelectSidebarTagPath: handleSelectSidebarTagPath,
        setNotesChildrenOpen,
        toggleExpandedTagPath,
      });
      return;
    }

    if (lowerKey === "l" || event.key === "ArrowRight") {
      const expandAction = getSidebarExpandAction({
        activeTagPath,
        availableTagTree,
        expandedTagPaths,
        noteFilter,
        notesChildrenOpen,
      });
      if (!expandAction) {
        return;
      }

      event.preventDefault();
      applySidebarExpandAction({
        action: expandAction,
        setNotesChildrenOpen,
        toggleExpandedTagPath,
      });
      return;
    }

    const direction = getNoteListNavigationDirectionForKey(event.key);
    if (!direction) {
      return;
    }

    const nextItem = getAdjacentSidebarNavigationItem(
      sidebarNavigationItems,
      activeSidebarItemId,
      direction,
    );
    if (!nextItem) {
      return;
    }

    event.preventDefault();
    selectSidebarNavigationItem({
      item: nextItem,
      onSelectAll,
      onSelectArchive,
      onSelectPinned,
      onSelectSidebarTagPath: handleSelectSidebarTagPath,
      onSelectToday,
      onSelectTodo,
      onSelectTrash,
      onSelectUntagged,
    });
  };

  return (
    <>
      <aside className="bg-sidebar flex h-full min-h-0 flex-col">
        <header
          className={cn(
            "flex h-13 shrink-0 items-center justify-end px-3",
            showHeaderBorder && "border-separator border-b",
          )}
        >
          <div className="relative z-40 flex gap-1">
            <Button
              aria-label={`Sync: ${syncState}`}
              className="text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              size="icon-sm"
              variant="ghost"
              onClick={() => setSyncDialogOpen(true)}
            >
              {syncState === "connected" && (
                <CloudCheck className="size-[1.2rem]" />
              )}
              {syncState === "needsUnlock" && (
                <CloudAlert className="text-warning size-[1.2rem]" />
              )}
              {(syncState === "syncing" ||
                syncState === "connecting" ||
                syncState === "authenticating") && (
                <CloudSync className="size-[1.2rem] animate-pulse" />
              )}
              {syncState === "error" && (
                <CloudAlert className="text-destructive size-[1.2rem]" />
              )}
              {syncState === "disconnected" && (
                <CloudOff className="size-[1.2rem]" />
              )}
            </Button>
            <SyncDialog
              open={syncDialogOpen}
              onOpenChange={setSyncDialogOpen}
            />
            <Button
              aria-label="Settings"
              className="text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              onClick={() => openSettings(true)}
              size="icon-sm"
              variant="ghost"
            >
              <Settings2 className="size-[1.2rem]" />
            </Button>
          </div>
        </header>
        <nav
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-2 pt-3"
          onFocusCapture={handleSidebarRowFocus}
          onKeyDown={handleSidebarKeyDown}
          onScroll={(event) => {
            setShowHeaderBorder(event.currentTarget.scrollTop > 0);
          }}
          ref={scrollContainerRef}
        >
          <NotesSection
            archivedCount={archivedCount}
            isFocused={isFocused}
            noteFilter={noteFilter}
            noteSectionHasActiveTag={noteSectionHasActiveTag}
            notesChildrenOpen={notesChildrenOpen}
            onEmptyTrash={onEmptyTrash}
            onRowRef={(itemId, element) => {
              if (element) {
                sidebarRowRefs.current.set(itemId, element);
              } else {
                sidebarRowRefs.current.delete(itemId);
              }
            }}
            onSidebarRowFocus={handleSidebarRowFocus}
            onSelectAll={onSelectAll}
            onSelectArchive={onSelectArchive}
            onSelectToday={onSelectToday}
            onSelectTodo={onSelectTodo}
            onSelectPinned={onSelectPinned}
            onSelectUntagged={onSelectUntagged}
            onSelectTrash={onSelectTrash}
            onToggleNotesChildren={() => {
              setNotesChildrenOpen(!notesChildrenOpen);
            }}
            todoCount={todoCount}
            trashedCount={trashedCount}
          />

          {availableTagTree.length > 0 ? (
            <section className="min-h-0 pt-1">
              <TagTree
                activeTagPath={activeTagPath}
                expandedTagPaths={expandedTagPaths}
                isFocused={isFocused}
                nodes={availableTagTree}
                onDeleteTag={onDeleteTag}
                onExportTag={onExportTag}
                onOpenRenameTagDialog={(path) => {
                  setRenameSourcePath(path);
                  setRenameInputValue(path);
                  setRenameDialogOpen(true);
                }}
                onSetTagPinned={onSetTagPinned}
                onToggleExpanded={toggleExpandedTagPath}
                onSelectTagPath={handleSelectSidebarTagPath}
                onSidebarRowFocus={handleSidebarRowFocus}
                onTagRowRef={(path, element) => {
                  if (element) {
                    sidebarRowRefs.current.set(`tag:${path}`, element);
                  } else {
                    sidebarRowRefs.current.delete(`tag:${path}`);
                  }
                }}
              />
              <div className="h-4 shrink-0" />
            </section>
          ) : null}
          <div className="h-px shrink-0" ref={footerSentinelRef} />
        </nav>

        {showFooterBorder ? (
          <div className="border-separator border-t" />
        ) : null}
      </aside>

      <RenameTagDialog
        open={renameDialogOpen}
        renameError={renameError}
        renameHasChanged={renameHasChanged}
        renameInputRef={renameInputRef}
        renameInputValue={renameInputValue}
        renameSourcePath={renameSourcePath}
        onClose={closeRenameDialog}
        onInputChange={setRenameInputValue}
        onOpenChange={(open) => {
          setRenameDialogOpen(open);
          if (!open) {
            closeRenameDialog();
          }
        }}
        onSubmit={handleRenameDialogSubmit}
      />
    </>
  );
}
