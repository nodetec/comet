import { type RefObject, useEffect, useRef, useState } from "react";
import {
  CloudAlert,
  CloudOff,
  CloudSync,
  CloudCheck,
  Settings2,
} from "lucide-react";

import { useCommandRequest } from "@/shared/hooks/use-command-request";
import { canonicalizeTagPath } from "@/shared/lib/tags";
import {
  flattenVisibleSidebarNavigationItems,
  getActiveSidebarNavigationItemId,
} from "@/features/sidebar-pane/lib/sidebar-navigation";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import { SyncDialog } from "@/shared/ui/sync-dialog";
import {
  useExpandedSidebarTagPaths,
  useSidebarNotesChildrenOpen,
  useUIActions,
} from "@/shared/stores/use-ui-store";
import { type ContextualTagNode, type NoteFilter } from "@/shared/api/types";
import {
  useActiveTagPath,
  useFocusedPane,
  useNoteFilter,
  useTagViewActive,
} from "@/shared/stores/use-app-state";
import { useCommandStore } from "@/shared/stores/use-command-store";
import { useNavigationStore } from "@/shared/stores/use-navigation-store";
import {
  focusSidebarRow,
  ancestorSidebarTagPaths,
} from "@/features/sidebar-pane/ui/sidebar-utils";
import { TagTree } from "@/features/sidebar-pane/ui/sidebar-tag-tree";
import { NotesSection } from "@/features/sidebar-pane/ui/sidebar-notes-section";
import { RenameTagDialog } from "@/features/sidebar-pane/ui/sidebar-rename-dialog";
import {
  renameErrorMessage,
  resetRenameDialog,
  submitRenameDialog,
  useRenameInputFocus,
} from "@/features/sidebar-pane/ui/sidebar-rename-utils";
import { useSyncState } from "@/features/sidebar-pane/hooks/use-sync-state";
import { useSidebarKeyboardNav } from "@/features/sidebar-pane/hooks/use-sidebar-keyboard-nav";

// --- Local hooks ---

function useSidebarBorders(params: {
  availableTagTreeLength: number;
  noteFilter: NoteFilter;
  scrollContainerRef: RefObject<HTMLElement | null>;
}) {
  const { availableTagTreeLength, noteFilter, scrollContainerRef } = params;
  const [showHeaderBorder, setShowHeaderBorder] = useState(false);
  const [showFooterBorder, setShowFooterBorder] = useState(false);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    setShowHeaderBorder((scrollContainer?.scrollTop ?? 0) > 0);
  }, [availableTagTreeLength, noteFilter, scrollContainerRef]);

  // Ref callback: set up IntersectionObserver when the sentinel mounts,
  // clean up when it unmounts. The sentinel is a direct child of the
  // scroll container, so node.parentElement gives us the observer root.
  const footerSentinelRef = (node: HTMLDivElement | null) => {
    if (!node) return;
    const scrollContainer = node.parentElement;
    if (!scrollContainer) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowFooterBorder(!entry?.isIntersecting);
      },
      {
        root: scrollContainer,
        threshold: 1,
      },
    );

    observer.observe(node);
    return () => observer.disconnect();
  };

  return {
    showHeaderBorder,
    setShowHeaderBorder,
    showFooterBorder,
    footerSentinelRef,
  };
}

function usePersistedExpandedTagPaths(availableTagPaths: string[]) {
  const expandedSidebarTagPaths = useExpandedSidebarTagPaths();
  const { setExpandedSidebarTagPaths } = useUIActions();

  // Drop expanded paths that no longer exist (e.g. a tag was renamed or
  // deleted). The store may keep stale entries across renders — they stay
  // invisible, and any toggle writes back the filtered set.
  const expandedTagPaths = new Set(
    expandedSidebarTagPaths.filter((path) => availableTagPaths.includes(path)),
  );

  const toggleExpandedTagPath = (path: string) => {
    const next = new Set(expandedTagPaths);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    setExpandedSidebarTagPaths([...next]);
  };

  return { expandedTagPaths, toggleExpandedTagPath };
}

// --- Main component ---

type SidebarPaneProps = {
  availableTagPaths: string[];
  availableTagTree: ContextualTagNode[];
  archivedCount: number;
  todoCount: number;
  trashedCount: number;
  onSelectAll(): void;
  onSelectToday(): void;
  onSelectTodo(): void;
  onSelectPinned(): void;
  onSelectUntagged(): void;
  onSelectArchive(): void;
  onSelectTrash(): void;
  onSelectTagPath(tagPath: string): void;
  onEmptyTrash(): void;
  onDeleteTag(path: string): void;
  onExportTag(path: string): void;
  onRenameTag(fromPath: string, toPath: string): void;
  onSetTagPinned(path: string, pinned: boolean): void;
  onSetTagHideSubtagNotes(path: string, hideSubtagNotes: boolean): void;
};

export function SidebarPane({
  availableTagPaths,
  availableTagTree,
  archivedCount,
  todoCount,
  trashedCount,
  onSelectAll,
  onSelectToday,
  onSelectTodo,
  onSelectPinned,
  onSelectUntagged,
  onSelectArchive,
  onSelectTrash,
  onSelectTagPath,
  onEmptyTrash,
  onDeleteTag,
  onExportTag,
  onRenameTag,
  onSetTagPinned,
  onSetTagHideSubtagNotes: _onSetTagHideSubtagNotes,
}: SidebarPaneProps) {
  const storeActiveTagPath = useActiveTagPath();
  const tagViewActive = useTagViewActive();
  const activeTagPath = tagViewActive ? storeActiveTagPath : null;
  const noteFilter = useNoteFilter();
  const focusedPane = useFocusedPane();
  const focusTagPathRequest = useCommandStore(
    (state) => state.focusTagPathRequest,
  );
  const isFocused = focusedPane === "sidebar";
  const { setFocusedPane } = useNavigationStore((state) => state.actions);

  const withSidebarFocus = (fn: () => void) => () => {
    setFocusedPane("sidebar");
    fn();
  };
  const {
    setSettingsOpen: openSettings,
    setSidebarNotesChildrenOpen: setNotesChildrenOpen,
  } = useUIActions();
  const notesChildrenOpen = useSidebarNotesChildrenOpen();
  const syncState = useSyncState();

  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameSourcePath, setRenameSourcePath] = useState("");
  const [renameInputValue, setRenameInputValue] = useState("");
  const [pendingScrollTagPath, setPendingScrollTagPath] = useState<
    string | null
  >(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const sidebarRowRefs = useRef(new Map<string, HTMLElement | null>());
  const {
    showHeaderBorder,
    setShowHeaderBorder,
    showFooterBorder,
    footerSentinelRef,
  } = useSidebarBorders({
    availableTagTreeLength: availableTagTree.length,
    noteFilter,
    scrollContainerRef,
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
  const expandedSidebarTagPaths = useExpandedSidebarTagPaths();
  const { setExpandedSidebarTagPaths } = useUIActions();
  useRenameInputFocus(renameDialogOpen, renameInputRef);
  const noteSectionHasActiveTag = activeTagPath !== null;
  const sidebarNavigationItems = flattenVisibleSidebarNavigationItems({
    archivedCount,
    availableTagTree,
    expandedTagPaths,
    noteFilter,
    notesChildrenOpen,
    trashedCount,
  });
  const activeSidebarItemId = getActiveSidebarNavigationItemId({
    activeTagPath,
    noteFilter,
  });

  useCommandRequest(
    focusTagPathRequest,
    (request) => {
      const tagPath = canonicalizeTagPath(request.tagPath);
      if (!tagPath || !availableTagPaths.includes(tagPath)) {
        return false;
      }

      const nextExpanded = new Set(expandedSidebarTagPaths);
      for (const ancestor of ancestorSidebarTagPaths(tagPath)) {
        nextExpanded.add(ancestor);
      }
      setExpandedSidebarTagPaths([...nextExpanded]);
      setPendingScrollTagPath(tagPath);
    },
    [availableTagPaths],
  );

  // --- Scroll to pending tag ---
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

  // --- Focus active item ---
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

  const focusedSelectAll = withSidebarFocus(onSelectAll);
  const focusedSelectToday = withSidebarFocus(onSelectToday);
  const focusedSelectTodo = withSidebarFocus(onSelectTodo);
  const focusedSelectPinned = withSidebarFocus(onSelectPinned);
  const focusedSelectUntagged = withSidebarFocus(onSelectUntagged);
  const focusedSelectArchive = withSidebarFocus(onSelectArchive);
  const focusedSelectTrash = withSidebarFocus(onSelectTrash);

  const handleSelectSidebarTagPath = (tagPath: string) => {
    setFocusedPane("sidebar");
    setPendingScrollTagPath(tagPath);
    onSelectTagPath(tagPath);
  };

  const handleSidebarRowFocus = () => {
    setFocusedPane("sidebar");
  };

  const handleSidebarKeyDown = useSidebarKeyboardNav({
    activeTagPath,
    availableTagTree,
    expandedTagPaths,
    noteFilter,
    notesChildrenOpen,
    sidebarNavigationItems,
    activeSidebarItemId,
    sidebarRowRefs,
    onSelectAll: focusedSelectAll,
    onSelectArchive: focusedSelectArchive,
    onSelectPinned: focusedSelectPinned,
    onSelectToday: focusedSelectToday,
    onSelectTodo: focusedSelectTodo,
    onSelectTrash: focusedSelectTrash,
    onSelectUntagged: focusedSelectUntagged,
    onSelectSidebarTagPath: handleSelectSidebarTagPath,
    setNotesChildrenOpen,
    toggleExpandedTagPath,
  });

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
            onSelectAll={focusedSelectAll}
            onSelectArchive={focusedSelectArchive}
            onSelectToday={focusedSelectToday}
            onSelectTodo={focusedSelectTodo}
            onSelectPinned={focusedSelectPinned}
            onSelectUntagged={focusedSelectUntagged}
            onSelectTrash={focusedSelectTrash}
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
