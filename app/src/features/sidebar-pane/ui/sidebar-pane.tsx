import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import {
  CloudAlert,
  CloudOff,
  CloudSync,
  CloudCheck,
  Settings2,
} from "lucide-react";

import { canonicalizeTagPath } from "@/features/editor/lib/tags";
import {
  flattenVisibleSidebarNavigationItems,
  getActiveSidebarNavigationItemId,
} from "@/features/sidebar-pane/lib/sidebar-navigation";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import { SyncDialog } from "@/features/sync";
import {
  useExpandedSidebarTagPaths,
  useSidebarNotesChildrenOpen,
  useUIActions,
} from "@/features/settings/store/use-ui-store";
import { type ContextualTagNode, type NoteFilter } from "@/shared/api/types";
import {
  useFocusedPane,
  useShellActions,
} from "@/features/shell/store/use-shell-store";
import {
  FOCUS_TAG_PATH_EVENT,
  type FocusTagPathDetail,
} from "@/shared/lib/tag-navigation";
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
  const expandedSidebarTagPaths = useExpandedSidebarTagPaths();
  const { setExpandedSidebarTagPaths } = useUIActions();

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

// --- Main component ---

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
  const focusedPane = useFocusedPane();
  const isFocused = focusedPane === "sidebar";
  const { setFocusedPane } = useShellActions();
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
  const expandedSidebarTagPaths = useExpandedSidebarTagPaths();
  const { setExpandedSidebarTagPaths } = useUIActions();
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

  // --- Focus tag path event ---
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

  const handleSelectSidebarTagPath = (tagPath: string) => {
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
    onSelectAll,
    onSelectArchive,
    onSelectPinned,
    onSelectToday,
    onSelectTodo,
    onSelectTrash,
    onSelectUntagged,
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
