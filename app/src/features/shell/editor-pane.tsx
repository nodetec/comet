import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { format } from "date-fns";
import { useUIStore } from "@/features/settings/store/use-ui-store";
import { useShellStore } from "@/features/shell/store/use-shell-store";
import cometLogo from "@/assets/comet.svg";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { CheckMenuItem, Menu, Submenu } from "@tauri-apps/api/menu";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Ellipsis,
  Lock,
  PencilOff,
  PanelBottomOpen,
  PanelBottomClose,
  Search,
  X,
} from "lucide-react";

import {
  NoteEditor,
  type NoteEditorHandle,
} from "@/features/editor/note-editor";
import { Button } from "@/shared/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { resolveActiveEditorSearch } from "@/shared/lib/search";
import { cn } from "@/shared/lib/utils";
import { type NoteConflictInfo } from "@/shared/api/types";

type EditorPaneProps = {
  archivedAt: number | null;
  deletedAt: number | null;
  editorKey: string | null;
  focusMode: "none" | "immediate" | "pointerup";
  html: string | null;
  isDeletePublishedNotePending: boolean;
  isResolveConflictPending: boolean;
  isNewNote: boolean;
  markdown: string;
  modifiedAt: number;
  noteConflict: NoteConflictInfo | null;
  noteId: string | null;
  pinnedAt: number | null;
  publishedAt: number | null;
  publishedKind: number | null;
  readonly: boolean;
  selectedConflictRevisionId: string | null;
  searchQuery: string;
  onDeletePublishedNote(): void;
  onDuplicateNote(): void;
  onOpenPublishDialog(): void;
  onPublishShortNote(): void;
  onResolveConflict(): void;
  onSetPinned(pinned: boolean): void;
  onSetReadonly(readonly: boolean): void;
  onLoadConflictHead(revisionId: string, markdown: string | null): void;
  onFocusHandled(): void;
  onChange(markdown: string): void;
};

// eslint-disable-next-line sonarjs/slow-regex -- bounded by single-line input
const H1_TITLE_RE = /^#\s+(.+?)\s*$/;

type EditorMenuContext = {
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
};

async function buildEditorMenu(
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
      ...publishItems,
    ],
  });

  try {
    await menu.popup(position);
  } finally {
    await menu.close();
  }
}

function firstLineH1Title(markdown: string) {
  const [firstLine = ""] = markdown.split("\n", 1);
  const match = H1_TITLE_RE.exec(firstLine);
  return match?.[1] ?? null;
}

function formatConflictHeadTimestamp(mtime: number) {
  return format(mtime, "MMM d, yyyy 'at' h:mm a");
}

function useEditorScrollHeader(
  noteId: string | null,
  scrollContainerRef: React.RefObject<HTMLDivElement | null>,
) {
  const [showHeaderBorder, setShowHeaderBorder] = useState(false);
  const [showHeaderTitle, setShowHeaderTitle] = useState(false);
  const noteScrollPositionsRef = useRef<Map<string, number>>(new Map());

  const updateHeaderState = useCallback(
    (scrollContainer: HTMLDivElement | null) => {
      const scrolled = (scrollContainer?.scrollTop ?? 0) > 0;
      setShowHeaderBorder(scrolled);

      if (!scrollContainer || !noteId) {
        setShowHeaderTitle(false);
        return;
      }

      const firstLine = scrollContainer.querySelector(
        "[data-lexical-editor] > :first-child",
      ) as HTMLElement | null;

      if (!firstLine) {
        setShowHeaderTitle(false);
        return;
      }

      const scrollRect = scrollContainer.getBoundingClientRect();
      const firstLineRect = firstLine.getBoundingClientRect();
      setShowHeaderTitle(firstLineRect.bottom <= scrollRect.top);
    },
    [noteId],
  );

  useLayoutEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) {
      updateHeaderState(null);
      return;
    }

    const nextScrollTop = noteId
      ? (noteScrollPositionsRef.current.get(noteId) ?? 0)
      : 0;
    scrollContainer.scrollTop = nextScrollTop;
    setShowHeaderBorder(nextScrollTop > 0);

    const frame = window.requestAnimationFrame(() => {
      updateHeaderState(scrollContainer);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [noteId, scrollContainerRef, updateHeaderState]);

  const scrollContainerCallbacks = useMemo(
    () => ({
      onScroll: (noteId: string | null, scrollTop: number) => {
        if (noteId) {
          noteScrollPositionsRef.current.set(noteId, scrollTop);
        }
      },
      updateHeaderState,
    }),
    [updateHeaderState],
  );

  return { showHeaderBorder, showHeaderTitle, scrollContainerCallbacks };
}

function useFindBar({
  noteId,
  searchQuery,
  editorRef,
  setFocusedPane,
}: {
  noteId: string | null;
  searchQuery: string;
  editorRef: React.RefObject<NoteEditorHandle | null>;
  setFocusedPane: (pane: "sidebar" | "notes" | "editor") => void;
}) {
  const [findOpen, setFindOpen] = useState(false);
  const [findMatchCount, setFindMatchCount] = useState(0);
  const [findQuery, setFindQuery] = useState("");
  const [activeFindMatchIndex, setActiveFindMatchIndex] = useState(0);
  const [findScrollRevision, setFindScrollRevision] = useState(0);
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const hasEditorFindQuery = findOpen && findQuery.trim().length > 0;

  const activeEditorSearch = resolveActiveEditorSearch({
    editorQuery: hasEditorFindQuery ? findQuery : "",
    noteQuery: searchQuery,
  });
  const editorSearchQuery = activeEditorSearch.query;
  const isUsingEditorFindSearch = activeEditorSearch.source === "editor";

  useEffect(() => {
    setActiveFindMatchIndex(0);
  }, [findQuery, noteId]);

  useEffect(() => {
    if (!isUsingEditorFindSearch) {
      setFindMatchCount(0);
    }
  }, [isUsingEditorFindSearch]);

  useEffect(() => {
    if (findMatchCount === 0) {
      setActiveFindMatchIndex(0);
      return;
    }
    setActiveFindMatchIndex((prev) => Math.min(prev, findMatchCount - 1));
  }, [findMatchCount]);

  const closeFind = useCallback(
    (focusEditor: boolean) => {
      setFocusedPane("editor");
      setFindOpen(false);
      setFindMatchCount(0);
      setFindQuery("");
      setActiveFindMatchIndex(0);
      if (focusEditor) {
        requestAnimationFrame(() => {
          editorRef.current?.focus();
        });
      }
    },
    [setFocusedPane, editorRef],
  );

  const stepActiveFindMatch = useCallback(
    (direction: 1 | -1) => {
      if (findMatchCount === 0) return;
      setActiveFindMatchIndex((prev) => {
        const next = prev + direction;
        if (next < 0) return findMatchCount - 1;
        if (next >= findMatchCount) return 0;
        return next;
      });
      setFindScrollRevision((r) => r + 1);
    },
    [findMatchCount],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "f") {
        event.preventDefault();
        setFocusedPane("editor");
        setFindOpen(true);
        requestAnimationFrame(() => {
          findInputRef.current?.focus();
          findInputRef.current?.select();
        });
      }
      if (event.key === "Escape" && findOpen) {
        event.preventDefault();
        closeFind(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeFind, findOpen, setFocusedPane]);

  return {
    findOpen,
    findMatchCount,
    findQuery,
    activeFindMatchIndex,
    findScrollRevision,
    findInputRef,
    editorSearchQuery,
    isUsingEditorFindSearch,
    setFindMatchCount,
    setFindQuery,
    setActiveFindMatchIndex,
    closeFind,
    stepActiveFindMatch,
  };
}

// eslint-disable-next-line sonarjs/cognitive-complexity
export function EditorPane({
  archivedAt,
  deletedAt,
  editorKey,
  focusMode,
  html,
  isDeletePublishedNotePending,
  isResolveConflictPending,
  isNewNote,
  markdown,
  modifiedAt,
  noteConflict,
  noteId,
  pinnedAt,
  publishedAt,
  publishedKind,
  readonly,
  selectedConflictRevisionId,
  searchQuery,
  onDeletePublishedNote,
  onDuplicateNote,
  onOpenPublishDialog,
  onPublishShortNote,
  onResolveConflict,
  onSetPinned,
  onSetReadonly,
  onLoadConflictHead,
  onFocusHandled,
  onChange,
}: EditorPaneProps) {
  const isArchived = archivedAt !== null;
  const isPublishedNote = publishedKind === 1;
  const isSystemReadOnly = isArchived || deletedAt !== null || isPublishedNote;
  const editorRef = useRef<NoteEditorHandle | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [toolbarContainer, setToolbarContainer] =
    useState<HTMLDivElement | null>(null);
  const [devtoolsContainer, setDevtoolsContainer] =
    useState<HTMLDivElement | null>(null);
  const toolbarContainerRef = useCallback((node: HTMLDivElement | null) => {
    setToolbarContainer(node);
  }, []);
  const devtoolsContainerRef = useCallback((node: HTMLDivElement | null) => {
    setDevtoolsContainer(node);
  }, []);
  const showToolbar = useUIStore((s) => s.showEditorToolbar);
  const setShowToolbar = useUIStore((s) => s.setShowEditorToolbar);
  const editorFontSize = useUIStore((s) => s.editorFontSize);
  const editorSpellCheck = useUIStore((s) => s.editorSpellCheck);
  const setFocusedPane = useShellStore((s) => s.setFocusedPane);
  const noteTitle = firstLineH1Title(markdown);
  const hasConflict = (noteConflict?.headCount ?? 0) > 1;
  const isReadOnly = readonly || isSystemReadOnly || hasConflict;
  const viewableConflictHeads =
    noteConflict?.heads.filter(
      (head) => head.op === "del" || Boolean(head.markdown),
    ) ?? [];
  const viewedConflictHeadIndex = (() => {
    if (viewableConflictHeads.length === 0) {
      return -1;
    }

    const selectedRevisionIndex = viewableConflictHeads.findIndex(
      (head) => head.revisionId === selectedConflictRevisionId,
    );
    if (selectedRevisionIndex !== -1) {
      return selectedRevisionIndex;
    }

    const currentHeadIndex = viewableConflictHeads.findIndex(
      (head) => head.isCurrent,
    );
    if (currentHeadIndex !== -1) {
      return currentHeadIndex;
    }

    return 0;
  })();
  const viewedConflictHead =
    viewedConflictHeadIndex >= 0
      ? viewableConflictHeads[viewedConflictHeadIndex]
      : null;
  const isViewingDeletedConflictHead = viewedConflictHead?.op === "del";
  const conflictPrimaryActionVariant = isViewingDeletedConflictHead
    ? "destructive"
    : "default";
  const conflictPrimaryActionLabel = isViewingDeletedConflictHead
    ? "Delete note"
    : "Choose";
  const conflictPrimaryActionPendingLabel = isViewingDeletedConflictHead
    ? "Deleting…"
    : "Choosing…";

  const find = useFindBar({ noteId, searchQuery, editorRef, setFocusedPane });
  const {
    findOpen,
    findMatchCount,
    findQuery,
    activeFindMatchIndex,
    findScrollRevision,
    findInputRef,
    editorSearchQuery,
    isUsingEditorFindSearch,
    setFindMatchCount,
    setFindQuery,
    setActiveFindMatchIndex,
    closeFind,
    stepActiveFindMatch,
  } = find;

  const { showHeaderBorder, showHeaderTitle, scrollContainerCallbacks } =
    useEditorScrollHeader(noteId, scrollContainerRef);

  const openEditorMenu = useCallback(
    async (position: LogicalPosition) => {
      if (!noteId) return;
      await buildEditorMenu(position, {
        readonly: readonly || hasConflict,
        isPublishedNote,
        isDeletePublishedNotePending,
        pinnedAt,
        publishedAt,
        onSetReadonly,
        onDeletePublishedNote,
        onPublishShortNote,
        onOpenPublishDialog,
        onSetPinned,
        onDuplicateNote,
      });
    },
    [
      isDeletePublishedNotePending,
      isPublishedNote,
      noteId,
      onDeletePublishedNote,
      onDuplicateNote,
      onOpenPublishDialog,
      onPublishShortNote,
      onSetPinned,
      onSetReadonly,
      pinnedAt,
      publishedAt,
      hasConflict,
      readonly,
    ],
  );

  const handleOpenMenu = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const buttonRect = event.currentTarget.getBoundingClientRect();
    await openEditorMenu(
      new LogicalPosition(buttonRect.right - 170, buttonRect.bottom + 6),
    );
  };

  const handleEditorContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    if (!noteId) {
      return;
    }

    event.preventDefault();
    void openEditorMenu(new LogicalPosition(event.clientX, event.clientY));
  };

  const handleEditorSurfaceMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (isReadOnly) {
      return;
    }

    const target = event.target as HTMLElement;

    if (target.closest("button, input, textarea, select, a, [role='button']")) {
      return;
    }

    if (target.closest("[data-lexical-editor]")) {
      return;
    }

    editorRef.current?.focus();
  };

  const menuButton = (
    <Button
      className="text-muted-foreground hover:bg-accent hover:text-accent-foreground pointer-events-auto"
      onClick={(event: MouseEvent<HTMLButtonElement>) =>
        void handleOpenMenu(event)
      }
      size="icon-sm"
      variant="ghost"
    >
      <Ellipsis className="size-[1.2rem]" />
    </Button>
  );

  let statusContent: React.ReactNode = null;
  if (isPublishedNote) {
    statusContent = (
      <>
        <span className="text-muted-foreground pointer-events-auto mr-1 text-xs">
          Published
        </span>
        <Tooltip>
          <TooltipTrigger className="text-muted-foreground/60 pointer-events-auto cursor-default">
            <Lock className="size-[1.2rem]" />
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Short notes are immutable on Nostr and can&apos;t be updated.
          </TooltipContent>
        </Tooltip>
      </>
    );
  } else if (publishedAt != null) {
    statusContent =
      modifiedAt <= publishedAt ? (
        <span className="text-muted-foreground pointer-events-auto text-xs">
          Published
        </span>
      ) : (
        <button
          className="text-muted-foreground hover:text-foreground pointer-events-auto cursor-default text-xs transition-colors"
          onClick={onOpenPublishDialog}
          type="button"
        >
          Update
        </button>
      );
  }

  let toolbarSlot: React.ReactNode = null;
  if (readonly || hasConflict) {
    toolbarSlot = (
      <Tooltip>
        <TooltipTrigger className="text-muted-foreground pointer-events-auto flex size-7 items-center justify-center rounded-[min(var(--radius-md),12px)]">
          <span
            aria-label={hasConflict ? "Resolve conflict to edit" : "Read-only"}
            title={hasConflict ? "Resolve conflict to edit" : "Read-only"}
          >
            <PencilOff className="size-[1.2rem]" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {hasConflict ? "Resolve conflict to edit" : "Read-only"}
        </TooltipContent>
      </Tooltip>
    );
  } else if (!isReadOnly) {
    toolbarSlot = (
      <Button
        className="text-muted-foreground hover:bg-accent hover:text-accent-foreground pointer-events-auto"
        onClick={() => setShowToolbar(!showToolbar)}
        size="icon-sm"
        variant="ghost"
        title={showToolbar ? "Hide toolbar" : "Show toolbar"}
      >
        {showToolbar ? (
          <PanelBottomClose className="size-[1.2rem]" />
        ) : (
          <PanelBottomOpen className="size-[1.2rem]" />
        )}
      </Button>
    );
  }

  return (
    <section className="bg-background relative flex h-full min-h-0 flex-col">
      <header
        className={cn(
          "flex h-13 shrink-0 items-center justify-between gap-3 px-4",
          showHeaderBorder && !findOpen && "border-divider border-b",
        )}
      >
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "truncate font-semibold transition-opacity duration-300",
              showHeaderTitle && noteTitle ? "opacity-100" : "opacity-0",
            )}
          >
            {noteTitle ?? ""}
          </p>
        </div>
        {noteId ? (
          <div className="pointer-events-none relative z-40 flex items-center gap-1">
            {statusContent}
            {toolbarSlot}
            {menuButton}
          </div>
        ) : null}
      </header>

      {noteId && hasConflict ? (
        <div className="border-primary/20 bg-primary/10 sticky top-0 z-30 border-b px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              Conflicting revisions detected
            </p>
          </div>
        </div>
      ) : null}

      {findOpen && noteId && (
        <div className="border-divider flex shrink-0 items-center gap-2 border-b px-3 pb-4">
          <label className="border-input/60 focus-within:border-primary relative flex min-w-0 flex-1 items-center gap-2 rounded-md border px-3 py-1">
            <Search className="text-muted-foreground size-3.5 shrink-0" />
            <input
              ref={findInputRef}
              className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
              placeholder="Search…"
              value={findQuery}
              onChange={(e) => {
                setFindQuery(e.target.value);
                setActiveFindMatchIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  stepActiveFindMatch(e.shiftKey ? -1 : 1);
                  return;
                }

                if (e.key === "Escape") {
                  e.preventDefault();
                  closeFind(true);
                }
              }}
            />
            <span className="text-muted-foreground min-w-12 text-right text-xs tabular-nums">
              {findQuery &&
                findMatchCount > 0 &&
                `${activeFindMatchIndex + 1}/${findMatchCount}`}
              {findQuery && findMatchCount === 0 && "0"}
            </span>
          </label>
          <Button
            className="text-muted-foreground"
            disabled={findMatchCount === 0}
            onClick={() => stepActiveFindMatch(-1)}
            onMouseDown={(event) => event.preventDefault()}
            size="icon-xs"
            variant="ghost"
          >
            <ChevronUp className="size-3.5" />
          </Button>
          <Button
            className="text-muted-foreground"
            disabled={findMatchCount === 0}
            onClick={() => stepActiveFindMatch(1)}
            onMouseDown={(event) => event.preventDefault()}
            size="icon-xs"
            variant="ghost"
          >
            <ChevronDown className="size-3.5" />
          </Button>
          <Button
            className="text-muted-foreground"
            onClick={() => {
              if (findQuery) {
                setFindMatchCount(0);
                setFindQuery("");
                setActiveFindMatchIndex(0);
                findInputRef.current?.focus();
              } else {
                closeFind(false);
              }
            }}
            onMouseDown={(event) => event.preventDefault()}
            size="icon-xs"
            variant="ghost"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <div
          className={cn(
            "h-full min-h-0 overflow-y-scroll overscroll-y-contain",
            !isReadOnly && "cursor-text",
            findOpen && "pt-2",
          )}
          data-editor-scroll-container
          onContextMenu={handleEditorContextMenu}
          onMouseDown={handleEditorSurfaceMouseDown}
          onScroll={(event) => {
            scrollContainerCallbacks.onScroll(
              noteId,
              event.currentTarget.scrollTop,
            );
            scrollContainerCallbacks.updateHeaderState(event.currentTarget);
          }}
          ref={scrollContainerRef}
          style={
            {
              "--editor-font-size": `${editorFontSize}px`,
            } as React.CSSProperties
          }
          spellCheck={editorSpellCheck}
        >
          {noteId ? (
            <div className="relative flex min-h-full w-full flex-col">
              {isViewingDeletedConflictHead ? (
                <div className="flex min-h-full items-center justify-center px-6">
                  <div className="max-w-sm text-center">
                    <p className="text-foreground text-sm font-medium">
                      This version deletes the note
                    </p>
                    <p className="text-muted-foreground mt-2 text-sm">
                      Choose Delete note to apply this version and remove the
                      note from sync.
                    </p>
                  </div>
                </div>
              ) : (
                <NoteEditor
                  devtoolsContainer={devtoolsContainer}
                  focusMode={focusMode}
                  html={html}
                  isNew={isNewNote}
                  loadKey={editorKey ?? noteId}
                  markdown={markdown}
                  onChange={onChange}
                  onEditorFocusChange={(focused) => {
                    if (focused) {
                      setFocusedPane("editor");
                    }
                  }}
                  onFocusHandled={onFocusHandled}
                  onSearchMatchCountChange={
                    isUsingEditorFindSearch ? setFindMatchCount : undefined
                  }
                  readOnly={isReadOnly}
                  ref={editorRef}
                  searchHighlightAllMatchesYellow={!isUsingEditorFindSearch}
                  searchActiveMatchIndex={
                    isUsingEditorFindSearch ? activeFindMatchIndex : null
                  }
                  searchQuery={editorSearchQuery}
                  searchScrollRevision={
                    isUsingEditorFindSearch ? findScrollRevision : undefined
                  }
                  toolbarContainer={toolbarContainer}
                />
              )}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <img
                src={cometLogo}
                alt=""
                className="size-32 opacity-50"
                draggable={false}
              />
            </div>
          )}
        </div>
        {noteId ? (
          <div className="pointer-events-none absolute top-4 right-4 z-50">
            <div className="pointer-events-auto" ref={devtoolsContainerRef} />
          </div>
        ) : null}
      </div>

      {noteId && !isReadOnly && showToolbar && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
          <div className="pointer-events-auto" ref={toolbarContainerRef} />
        </div>
      )}

      {noteId && hasConflict ? (
        <div className="border-divider bg-background/95 shrink-0 border-t backdrop-blur">
          <div className="flex h-13 items-center justify-between gap-4 px-4">
            <div className="min-w-0">
              <p className="text-foreground truncate text-xs font-medium">
                {viewedConflictHead?.title ??
                  (viewedConflictHead?.op === "del"
                    ? "Deleted version"
                    : "Conflicting revision")}
              </p>
              <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-[11px]">
                <span>
                  {viewedConflictHead
                    ? formatConflictHeadTimestamp(viewedConflictHead.mtime)
                    : "No previewable revision available"}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button
                className="shadow-none"
                disabled={isResolveConflictPending || readonly}
                onClick={onResolveConflict}
                size="sm"
                type="button"
                variant={conflictPrimaryActionVariant}
              >
                {isResolveConflictPending
                  ? conflictPrimaryActionPendingLabel
                  : conflictPrimaryActionLabel}
              </Button>
              <Button
                className="text-muted-foreground"
                disabled={viewedConflictHeadIndex <= 0}
                onClick={() => {
                  const previousHead =
                    viewedConflictHeadIndex > 0
                      ? viewableConflictHeads[viewedConflictHeadIndex - 1]
                      : null;
                  if (previousHead) {
                    onLoadConflictHead(
                      previousHead.revisionId,
                      previousHead.markdown,
                    );
                  }
                }}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <ChevronLeft className="size-[1.2rem]" />
              </Button>
              <Button
                className="text-muted-foreground"
                disabled={
                  viewedConflictHeadIndex < 0 ||
                  viewedConflictHeadIndex >= viewableConflictHeads.length - 1
                }
                onClick={() => {
                  const nextHead =
                    viewedConflictHeadIndex >= 0 &&
                    viewedConflictHeadIndex < viewableConflictHeads.length - 1
                      ? viewableConflictHeads[viewedConflictHeadIndex + 1]
                      : null;
                  if (nextHead) {
                    onLoadConflictHead(nextHead.revisionId, nextHead.markdown);
                  }
                }}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <ChevronRight className="size-[1.2rem]" />
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
