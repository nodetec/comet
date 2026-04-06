import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { format } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
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
  PanelBottomClose,
  PanelBottomOpen,
  Search,
  X,
} from "lucide-react";

import {
  NoteEditor,
  type NoteEditorHandle,
} from "@/features/editor/note-editor";
import {
  isEditorFindShortcut,
  isNotesSearchShortcut,
} from "@/shared/lib/keyboard";
import { Button } from "@/shared/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { resolveActiveEditorSearch } from "@/shared/lib/search";
import { cn } from "@/shared/lib/utils";
import { type NoteConflictInfo } from "@/shared/api/types";

const OPEN_EDITOR_FIND_EVENT = "comet:open-editor-find";
const TOOLBAR_ENTER_ANIMATION = {
  damping: 28,
  mass: 0.8,
  stiffness: 360,
  type: "spring" as const,
};
const TOOLBAR_EXIT_ANIMATION = {
  duration: 0.16,
  ease: [0.4, 0, 1, 1] as const,
};

type EditorPaneProps = {
  availableTagPaths: string[];
  archivedAt: number | null;
  autoFocusEditor: boolean;
  deletedAt: number | null;
  editorKey: string | null;
  isDeletePublishedNotePending: boolean;
  isResolveConflictPending: boolean;
  markdown: string;
  modifiedAt: number;
  noteConflict: NoteConflictInfo | null;
  noteId: string | null;
  pinnedAt: number | null;
  publishedAt: number | null;
  publishedKind: number | null;
  readonly: boolean;
  selectedConflictSnapshotId: string | null;
  searchQuery: string;
  onAutoFocusEditorHandled(): void;
  onDeletePublishedNote(): void;
  onDuplicateNote(): void;
  onOpenPublishDialog(): void;
  onPublishShortNote(): void;
  onResolveConflict(): void;
  onOpenHistory(): void;
  onSetPinned(pinned: boolean): void;
  onSetReadonly(readonly: boolean): void;
  onLoadConflictHead(snapshotId: string, markdown: string | null): void;
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
  onOpenHistory(): void;
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
        ".cm-content > .cm-line:first-child",
      ) as HTMLElement | null;

      if (!firstLine) {
        setShowHeaderTitle(scrolled);
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
  const lastActiveNoteIdRef = useRef(noteId);
  const hasEditorFindQuery = findOpen && findQuery.trim().length > 0;

  const activeEditorSearch = resolveActiveEditorSearch({
    editorQuery: hasEditorFindQuery ? findQuery : "",
    noteQuery: searchQuery,
  });
  const editorSearchQuery = activeEditorSearch.query;
  const isUsingEditorFindSearch = activeEditorSearch.source === "editor";
  const activeEditorFindMatchCount = isUsingEditorFindSearch
    ? findMatchCount
    : 0;
  const resolvedActiveFindMatchIndex =
    activeEditorFindMatchCount === 0
      ? 0
      : Math.min(activeFindMatchIndex, activeEditorFindMatchCount - 1);

  if (lastActiveNoteIdRef.current !== noteId) {
    lastActiveNoteIdRef.current = noteId;
    if (activeFindMatchIndex !== 0) {
      setActiveFindMatchIndex(0);
    }
  }

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

  const focusFindInput = useCallback(() => {
    requestAnimationFrame(() => {
      findInputRef.current?.focus();
      findInputRef.current?.select();
    });
  }, []);

  const openFind = useCallback(() => {
    setFocusedPane("editor");
    setFindOpen(true);

    if (findOpen) {
      focusFindInput();
    }
  }, [findOpen, focusFindInput, setFocusedPane]);

  const stepActiveFindMatch = useCallback(
    (direction: 1 | -1) => {
      if (activeEditorFindMatchCount === 0) return;
      setActiveFindMatchIndex((prev) => {
        const current =
          activeEditorFindMatchCount === 0
            ? 0
            : Math.min(prev, activeEditorFindMatchCount - 1);
        const next = current + direction;
        if (next < 0) return activeEditorFindMatchCount - 1;
        if (next >= activeEditorFindMatchCount) return 0;
        return next;
      });
      setFindScrollRevision((r) => r + 1);
    },
    [activeEditorFindMatchCount],
  );

  const ensureActiveFindMatch = useCallback(() => {
    if (activeEditorFindMatchCount === 0 || findQuery.trim().length === 0) {
      return;
    }

    setFindScrollRevision((value) => value + 1);
  }, [activeEditorFindMatchCount, findQuery]);

  useLayoutEffect(() => {
    if (!findOpen || !noteId) {
      return;
    }

    focusFindInput();
  }, [findOpen, focusFindInput, noteId]);

  const handleGlobalFindKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented) {
      return;
    }

    if (isNotesSearchShortcut(event)) {
      return;
    }

    if (isEditorFindShortcut(event)) {
      event.preventDefault();
      openFind();
    }
    if (event.key === "Escape" && findOpen) {
      event.preventDefault();
      closeFind(true);
    }
  });

  const handleOpenEditorFind = useEffectEvent((_event: Event) => {
    openFind();
  });

  useEffect(() => {
    window.addEventListener("keydown", handleGlobalFindKeyDown);
    window.addEventListener(OPEN_EDITOR_FIND_EVENT, handleOpenEditorFind);
    return () => {
      window.removeEventListener("keydown", handleGlobalFindKeyDown);
      window.removeEventListener(OPEN_EDITOR_FIND_EVENT, handleOpenEditorFind);
    };
  }, []);

  return {
    findOpen,
    findMatchCount: activeEditorFindMatchCount,
    findQuery,
    activeFindMatchIndex: resolvedActiveFindMatchIndex,
    findScrollRevision,
    findInputRef,
    editorSearchQuery,
    isUsingEditorFindSearch,
    setFindMatchCount,
    setFindQuery,
    setActiveFindMatchIndex,
    closeFind,
    ensureActiveFindMatch,
    stepActiveFindMatch,
  };
}

function isEditableElement(element: EventTarget | null) {
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

// eslint-disable-next-line sonarjs/cognitive-complexity
export function EditorPane({
  availableTagPaths,
  archivedAt,
  autoFocusEditor,
  deletedAt,
  editorKey,
  isDeletePublishedNotePending,
  isResolveConflictPending,
  markdown,
  modifiedAt,
  noteConflict,
  noteId,
  pinnedAt,
  publishedAt,
  publishedKind,
  readonly,
  selectedConflictSnapshotId,
  searchQuery,
  onAutoFocusEditorHandled,
  onDeletePublishedNote,
  onDuplicateNote,
  onOpenPublishDialog,
  onPublishShortNote,
  onResolveConflict,
  onOpenHistory,
  onSetPinned,
  onSetReadonly,
  onLoadConflictHead,
  onChange,
}: EditorPaneProps) {
  const isArchived = archivedAt !== null;
  const isPublishedNote = publishedKind === 1;
  const isSystemReadOnly = isArchived || deletedAt !== null || isPublishedNote;
  const editorRef = useRef<NoteEditorHandle | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [toolbarContainer, setToolbarContainer] = useState<HTMLElement | null>(
    null,
  );
  const editorFontSize = useUIStore((s) => s.editorFontSize);
  const showToolbar = useUIStore((s) => s.showEditorToolbar);
  const editorSpellCheck = useUIStore((s) => s.editorSpellCheck);
  const editorVimMode = useUIStore((s) => s.editorVimMode);
  const setShowToolbar = useUIStore((s) => s.setShowEditorToolbar);
  const setFocusedPane = useShellStore((s) => s.setFocusedPane);
  const noteTitle = firstLineH1Title(markdown);
  const hasConflict = (noteConflict?.snapshotCount ?? 0) > 1;
  const viewableConflictSnapshots =
    noteConflict?.snapshots.filter(
      (snapshot) => snapshot.op === "del" || Boolean(snapshot.markdown),
    ) ?? [];
  const viewedConflictSnapshotIndex = (() => {
    if (viewableConflictSnapshots.length === 0) {
      return -1;
    }

    const selectedSnapshotIndex = viewableConflictSnapshots.findIndex(
      (snapshot) => snapshot.snapshotId === selectedConflictSnapshotId,
    );
    if (selectedSnapshotIndex !== -1) {
      return selectedSnapshotIndex;
    }

    const currentSnapshotIndex = viewableConflictSnapshots.findIndex(
      (snapshot) => snapshot.isCurrent,
    );
    if (currentSnapshotIndex !== -1) {
      return currentSnapshotIndex;
    }

    return 0;
  })();
  const viewedConflictSnapshot =
    viewedConflictSnapshotIndex >= 0
      ? viewableConflictSnapshots[viewedConflictSnapshotIndex]
      : null;
  const isViewingDeletedConflictSnapshot = viewedConflictSnapshot?.op === "del";
  const isReadOnly =
    readonly || isSystemReadOnly || isViewingDeletedConflictSnapshot;

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
    ensureActiveFindMatch,
    stepActiveFindMatch,
  } = find;

  const { showHeaderBorder, showHeaderTitle, scrollContainerCallbacks } =
    useEditorScrollHeader(noteId, scrollContainerRef);
  const toolbarContainerRef = useCallback((node: HTMLDivElement | null) => {
    setToolbarContainer(node);
  }, []);
  const editorLoadKey = noteId ? (editorKey ?? noteId) : null;
  const editorContent = (() => {
    if (noteId === null) {
      return null;
    }

    if (isViewingDeletedConflictSnapshot) {
      return (
        <div className="flex min-h-full items-center justify-center px-6">
          <div className="max-w-sm text-center">
            <p className="text-foreground text-sm font-medium">
              This version deletes the note
            </p>
            <p className="text-muted-foreground mt-2 text-sm">
              Use the conflict actions below to keep the deletion, restore the
              note, or merge a new version.
            </p>
          </div>
        </div>
      );
    }

    return (
      <NoteEditor
        availableTagPaths={availableTagPaths}
        autoFocus={autoFocusEditor}
        loadKey={editorLoadKey ?? noteId}
        markdown={markdown}
        onChange={onChange}
        onAutoFocusHandled={onAutoFocusEditorHandled}
        onEditorFocusChange={(focused) => {
          if (focused) {
            setFocusedPane("editor");
          }
        }}
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
        spellCheck={editorSpellCheck}
        toolbarContainer={toolbarContainer}
        vimMode={editorVimMode}
      />
    );
  })();

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
        onOpenHistory,
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
      onOpenHistory,
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

    if (target.closest(".cm-editor")) {
      return;
    }

    editorRef.current?.focus();
  };

  const handleGlobalHistoryKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (!noteId || !(event.metaKey || event.ctrlKey)) {
      return;
    }

    if (isEditableElement(event.target)) {
      return;
    }

    const key = event.key.toLowerCase();
    let handled = false;
    if (key === "z") {
      handled = event.shiftKey
        ? (editorRef.current?.redo() ?? false)
        : (editorRef.current?.undo() ?? false);
    } else if (key === "y") {
      handled = editorRef.current?.redo() ?? false;
    }

    if (!handled) {
      return;
    }

    event.preventDefault();
    setFocusedPane("editor");
  });

  useEffect(() => {
    window.addEventListener("keydown", handleGlobalHistoryKeyDown);
    return () =>
      window.removeEventListener("keydown", handleGlobalHistoryKeyDown);
  }, []);

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
  if (readonly || isViewingDeletedConflictSnapshot) {
    toolbarSlot = (
      <Tooltip>
        <TooltipTrigger className="text-muted-foreground pointer-events-auto flex size-7 items-center justify-center rounded-[min(var(--radius-md),12px)]">
          <span
            aria-label={
              isViewingDeletedConflictSnapshot
                ? "Choose or merge a note version to edit"
                : "Read-only"
            }
            title={
              isViewingDeletedConflictSnapshot
                ? "Choose or merge a note version to edit"
                : "Read-only"
            }
          >
            <PencilOff className="size-[1.2rem]" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {isViewingDeletedConflictSnapshot
            ? "Choose or merge a note version to edit"
            : "Read-only"}
        </TooltipContent>
      </Tooltip>
    );
  } else if (!isReadOnly) {
    toolbarSlot = (
      <Button
        className="text-muted-foreground hover:bg-accent hover:text-accent-foreground pointer-events-auto"
        onClick={() => setShowToolbar(!showToolbar)}
        size="icon-sm"
        title={showToolbar ? "Hide toolbar" : "Show toolbar"}
        variant="ghost"
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
          showHeaderBorder && !findOpen && "border-separator border-b",
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
              Conflicting note versions detected
            </p>
          </div>
        </div>
      ) : null}

      {findOpen && noteId && (
        <div className="border-separator flex shrink-0 items-center gap-2 border-b px-3 pb-4">
          <label className="border-input/60 focus-within:border-primary relative flex min-w-0 flex-1 items-center gap-2 rounded-md border px-3 py-1">
            <Search className="text-muted-foreground size-3.5 shrink-0" />
            <input
              autoCapitalize="off"
              ref={findInputRef}
              className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
              placeholder="Search…"
              value={findQuery}
              onChange={(e) => {
                setFindQuery(e.target.value);
                setActiveFindMatchIndex(0);
              }}
              onFocus={() => {
                ensureActiveFindMatch();
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
          onMouseUp={(event) => {
            // Force WebKit to re-evaluate the cursor after drag-select.
            // In fullscreen, the OS cursor state can get stuck when the
            // pointer hits the screen edge during a drag.
            const el = event.currentTarget;
            el.style.cursor = "auto";
            requestAnimationFrame(() => {
              el.style.cursor = "";
            });
          }}
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
              {editorContent}
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
      </div>

      <AnimatePresence initial={false}>
        {noteId && !isReadOnly && showToolbar ? (
          <motion.div
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
              transition: TOOLBAR_ENTER_ANIMATION,
            }}
            className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center"
            exit={{
              opacity: 0.85,
              scale: 0.97,
              transition: TOOLBAR_EXIT_ANIMATION,
              y: 22,
            }}
            initial={{
              opacity: 0.72,
              scale: 0.94,
              y: 20,
            }}
            key="editor-toolbar"
            style={{ transformOrigin: "50% 100%" }}
          >
            <div className="pointer-events-auto" ref={toolbarContainerRef} />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {noteId && hasConflict ? (
        <div className="border-separator bg-background/95 shrink-0 border-t backdrop-blur">
          <div className="flex h-13 items-center justify-between gap-4 px-4">
            <div className="min-w-0">
              <p className="text-foreground truncate text-xs font-medium">
                {viewedConflictSnapshot?.title ??
                  (viewedConflictSnapshot?.op === "del"
                    ? "Deleted snapshot"
                    : "Conflicting snapshot")}
              </p>
              <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-[11px]">
                <span>
                  {viewedConflictSnapshot
                    ? formatConflictHeadTimestamp(viewedConflictSnapshot.mtime)
                    : "No previewable snapshot available"}
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
                variant="default"
              >
                {isResolveConflictPending ? "Resolving…" : "Resolve"}
              </Button>
              <Button
                className="text-muted-foreground"
                disabled={viewedConflictSnapshotIndex <= 0}
                onClick={() => {
                  const previousHead =
                    viewedConflictSnapshotIndex > 0
                      ? viewableConflictSnapshots[
                          viewedConflictSnapshotIndex - 1
                        ]
                      : null;
                  if (previousHead) {
                    onLoadConflictHead(
                      previousHead.snapshotId,
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
                  viewedConflictSnapshotIndex < 0 ||
                  viewedConflictSnapshotIndex >=
                    viewableConflictSnapshots.length - 1
                }
                onClick={() => {
                  const nextHead =
                    viewedConflictSnapshotIndex >= 0 &&
                    viewedConflictSnapshotIndex <
                      viewableConflictSnapshots.length - 1
                      ? viewableConflictSnapshots[
                          viewedConflictSnapshotIndex + 1
                        ]
                      : null;
                  if (nextHead) {
                    onLoadConflictHead(nextHead.snapshotId, nextHead.markdown);
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
