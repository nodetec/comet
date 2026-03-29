import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from "react";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ask } from "@tauri-apps/plugin-dialog";
import { CheckMenuItem, Menu } from "@tauri-apps/api/menu";
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
  Pin,
  Settings2,
  Trash2,
} from "lucide-react";

import { canonicalizeTagPath } from "@/features/editor/lib/tags";
import { Button } from "@/shared/ui/button";
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

function sidebarItemClasses(isActive: boolean, isFocused?: boolean) {
  let stateClass: string;
  if (isActive && isFocused) {
    stateClass =
      "bg-primary/50 text-primary-foreground [&_svg]:text-primary-foreground";
  } else if (isActive) {
    stateClass = "bg-accent/80 text-secondary-foreground";
  } else {
    stateClass = "text-secondary-foreground";
  }
  return `flex w-full cursor-default items-center gap-3 rounded-md px-3 py-1.5 text-left text-sm transition-colors ${stateClass}`;
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
    onSetTagHideSubtagNotes(path: string, hideSubtagNotes: boolean): void;
  },
) {
  event.preventDefault();
  const isRootTag = !node.path.includes("/");

  const items: Array<
    | CheckMenuItem
    | { item: "Separator" }
    | { id: string; text: string; action: () => void }
  > = [
    {
      id: `rename-${node.path}`,
      text: "Rename Tag...",
      action: () => ctx.onOpenRenameTagDialog(node.path),
    },
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
    {
      id: `export-${node.path}`,
      text: "Export Tag…",
      action: () => ctx.onExportTag(node.path),
    },
  ];

  if (node.children.length > 0 || isRootTag) {
    items.push({ item: "Separator" as const });
  }

  if (isRootTag) {
    items.push({
      id: `pin-${node.path}`,
      text: node.pinned ? "Unpin From Top" : "Pin To Top",
      action: () => ctx.onSetTagPinned(node.path, !node.pinned),
    });
  }

  if (node.children.length > 0) {
    items.push(
      await CheckMenuItem.new({
        id: `hide-subtags-${node.path}`,
        text: "Hide Subtag Notes",
        checked: node.hideSubtagNotes,
        action: () =>
          ctx.onSetTagHideSubtagNotes(node.path, !node.hideSubtagNotes),
      }),
    );
  }

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
  onSetTagHideSubtagNotes,
  onSetTagPinned,
  onToggleExpanded,
  onSelectTagPath,
}: {
  activeTagPath: string | null;
  expandedTagPaths: Set<string>;
  isFocused: boolean;
  nodes: ContextualTagNode[];
  onDeleteTag(path: string): void;
  onExportTag(path: string): void;
  onOpenRenameTagDialog(path: string): void;
  onSetTagHideSubtagNotes(path: string, hideSubtagNotes: boolean): void;
  onSetTagPinned(path: string, pinned: boolean): void;
  onToggleExpanded(path: string): void;
  onSelectTagPath(path: string): void;
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
              className={cn(
                sidebarItemClasses(isActive, isFocused),
                "group pr-2",
              )}
              onClick={() => onSelectTagPath(node.path)}
              onContextMenu={(event) =>
                void showTagContextMenu(event, node, {
                  onDeleteTag,
                  onExportTag,
                  onOpenRenameTagDialog,
                  onSetTagPinned,
                  onSetTagHideSubtagNotes,
                })
              }
            >
              <div
                className="flex w-full items-center"
                style={{ paddingLeft: `${12 + indentLevel * 12}px` }}
              >
                {hasChildren ? (
                  <button
                    className="flex size-5 shrink-0 items-center justify-center rounded-sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleExpanded(node.path);
                    }}
                    type="button"
                  >
                    <ChevronRight
                      className={cn(
                        "size-3 transition-transform",
                        isExpanded ? "rotate-90" : "rotate-0",
                      )}
                    />
                  </button>
                ) : (
                  <span className="inline-block size-5 shrink-0" />
                )}
                <div className="flex min-w-0 flex-1 items-center text-left">
                  <span className="truncate">{node.label}</span>
                  {node.pinned ? (
                    <Pin className="text-primary/80 ml-auto size-3 shrink-0 fill-current" />
                  ) : null}
                </div>
              </div>
            </div>
            {hasChildren && isExpanded ? (
              <TagTree
                activeTagPath={activeTagPath}
                expandedTagPaths={expandedTagPaths}
                isFocused={isFocused}
                nodes={node.children}
                onDeleteTag={onDeleteTag}
                onExportTag={onExportTag}
                onOpenRenameTagDialog={onOpenRenameTagDialog}
                onSetTagHideSubtagNotes={onSetTagHideSubtagNotes}
                onSetTagPinned={onSetTagPinned}
                onToggleExpanded={onToggleExpanded}
                onSelectTagPath={onSelectTagPath}
              />
            ) : null}
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

function NotesSection({
  archivedCount,
  isFocused,
  noteFilter,
  noteSectionHasActiveTag,
  onEmptyTrash,
  onSelectAll,
  onSelectArchive,
  onSelectToday,
  onSelectTodo,
  onSelectTrash,
  todoCount,
  trashedCount,
}: {
  archivedCount: number;
  isFocused: boolean;
  noteFilter: NoteFilter;
  noteSectionHasActiveTag: boolean;
  onEmptyTrash: () => void;
  onSelectAll: () => void;
  onSelectArchive: () => void;
  onSelectToday: () => void;
  onSelectTodo: () => void;
  onSelectTrash: () => void;
  todoCount: number;
  trashedCount: number;
}) {
  const handleTrashContextMenu = (event: MouseEvent<HTMLButtonElement>) => {
    showTrashContextMenu(event, onEmptyTrash).catch(() => {});
  };

  return (
    <section className="space-y-0.5">
      <button
        className={sidebarItemClasses(
          noteFilter === "all" && !noteSectionHasActiveTag,
          isFocused,
        )}
        onClick={onSelectAll}
        type="button"
      >
        <FileTextIcon className="text-primary size-4 shrink-0" />
        Notes
      </button>
      <button
        className={sidebarItemClasses(
          noteFilter === "today" && !noteSectionHasActiveTag,
          isFocused,
        )}
        onClick={onSelectToday}
        type="button"
      >
        <CalendarDays className="text-primary size-4 shrink-0" />
        Today
      </button>
      <button
        className={sidebarItemClasses(
          noteFilter === "todo" && !noteSectionHasActiveTag,
          isFocused,
        )}
        onClick={onSelectTodo}
        type="button"
      >
        {todoCount > 0 ? (
          <Square className="text-primary size-4 shrink-0" />
        ) : (
          <CheckSquare className="text-primary size-4 shrink-0" />
        )}
        Todo
      </button>
      {(archivedCount > 0 || noteFilter === "archive") && (
        <button
          className={sidebarItemClasses(
            noteFilter === "archive" && !noteSectionHasActiveTag,
            isFocused,
          )}
          onClick={onSelectArchive}
          type="button"
        >
          <Archive className="text-primary size-4 shrink-0" />
          Archive
        </button>
      )}
      {(trashedCount > 0 || noteFilter === "trash") && (
        <button
          className={sidebarItemClasses(
            noteFilter === "trash" && !noteSectionHasActiveTag,
            isFocused,
          )}
          onClick={onSelectTrash}
          onContextMenu={(event) => handleTrashContextMenu(event)}
          type="button"
        >
          <Trash2 className="text-primary size-4 shrink-0" />
          Trash
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
  onSelectArchive,
  onSelectTrash,
  onEmptyTrash,
  onDeleteTag,
  onExportTag,
  onRenameTag,
  onSetTagPinned,
  onSetTagHideSubtagNotes,
  onSelectTagPath,
}: SidebarPaneProps) {
  const isFocused = useShellStore((s) => s.focusedPane === "sidebar");
  const openSettings = useUIStore((s) => s.setSettingsOpen);
  const syncState = useSyncState();

  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameSourcePath, setRenameSourcePath] = useState("");
  const [renameInputValue, setRenameInputValue] = useState("");
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const footerSentinelRef = useRef<HTMLDivElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
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
  useRenameInputFocus(renameDialogOpen, renameInputRef);
  const noteSectionHasActiveTag = activeTagPath !== null;

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

  return (
    <>
      <aside className="bg-sidebar flex h-full min-h-0 flex-col">
        <header
          className={cn(
            "flex h-13 shrink-0 items-center justify-end px-3",
            showHeaderBorder && "border-divider border-b",
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
                <CloudAlert className="size-[1.2rem] text-amber-500" />
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
            onEmptyTrash={onEmptyTrash}
            onSelectAll={onSelectAll}
            onSelectArchive={onSelectArchive}
            onSelectToday={onSelectToday}
            onSelectTodo={onSelectTodo}
            onSelectTrash={onSelectTrash}
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
                onSetTagHideSubtagNotes={onSetTagHideSubtagNotes}
                onSetTagPinned={onSetTagPinned}
                onToggleExpanded={toggleExpandedTagPath}
                onSelectTagPath={onSelectTagPath}
              />
            </section>
          ) : null}
          <div className="h-px shrink-0" ref={footerSentinelRef} />
        </nav>

        {showFooterBorder ? <div className="border-divider border-t" /> : null}
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
