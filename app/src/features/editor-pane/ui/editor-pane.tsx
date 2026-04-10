import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  useEditorFontSize,
  useEditorSpellCheck,
  useEditorVimMode,
  useNotesPanelVisible,
  useShowEditorToolbar,
  useUIActions,
} from "@/features/settings/store/use-ui-store";
import { useShellActions } from "@/features/shell/store/use-shell-store";
import cometLogo from "@/assets/comet.svg";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import {
  Ellipsis,
  Link2,
  Lock,
  PencilOff,
  PanelBottomClose,
  PanelBottomOpen,
} from "lucide-react";

import {
  NoteEditor,
  type NoteEditorHandle,
} from "@/features/editor/note-editor";
import {
  type FocusEditorDetail,
  FOCUS_EDITOR_EVENT,
} from "@/shared/lib/pane-navigation";
import { Button } from "@/shared/ui/button";
import { PopoverPopup, PopoverRoot, PopoverTrigger } from "@/shared/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { cn } from "@/shared/lib/utils";
import { type NoteBacklink, type NoteConflictInfo } from "@/shared/api/types";

import {
  TOOLBAR_ENTER_ANIMATION,
  TOOLBAR_EXIT_ANIMATION,
  buildEditorMenu,
  firstLineH1Title,
  isEditableElement,
} from "@/features/editor-pane/lib/editor-pane-utils";
import { useEditorScrollHeader } from "@/features/editor-pane/hooks/use-editor-scroll-header";
import { useFindBar } from "@/features/editor-pane/hooks/use-find-bar";
import { EditorFindBar } from "@/features/editor-pane/ui/editor-find-bar";
import { ConflictResolutionFooter } from "@/features/editor-pane/ui/conflict-resolution-footer";

type EditorPaneProps = {
  availableTagPaths: string[];
  archivedAt: number | null;
  autoFocusEditor: boolean;
  backlinks: NoteBacklink[];
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
  onSelectLinkedNote(noteId: string): void;
  onChange(markdown: string): void;
};

// eslint-disable-next-line sonarjs/cognitive-complexity
export function EditorPane({
  availableTagPaths,
  archivedAt,
  autoFocusEditor,
  backlinks,
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
  onSelectLinkedNote,
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
  const editorFontSize = useEditorFontSize();
  const notesPanelVisible = useNotesPanelVisible();
  const showToolbar = useShowEditorToolbar();
  const editorSpellCheck = useEditorSpellCheck();
  const editorVimMode = useEditorVimMode();
  const { setShowEditorToolbar: setShowToolbar } = useUIActions();
  const { setFocusedPane } = useShellActions();
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
    readonly ||
    isSystemReadOnly ||
    hasConflict ||
    isViewingDeletedConflictSnapshot;

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
        noteId={noteId}
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

    editorRef.current?.focusAtEnd();
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

  const handleFocusEditor = useEffectEvent((event: Event) => {
    if (!noteId) {
      return;
    }

    const customEvent = event as CustomEvent<FocusEditorDetail>;
    const scrollTo = customEvent.detail?.scrollTo ?? "preserve";

    setFocusedPane("editor");
    requestAnimationFrame(() => {
      if (scrollTo === "top") {
        editorRef.current?.focusAtStart();
        scrollContainerRef.current?.scrollTo({ top: 0 });
        return;
      }

      editorRef.current?.focus();
    });
  });

  useEffect(() => {
    window.addEventListener(FOCUS_EDITOR_EVENT, handleFocusEditor);
    return () => {
      window.removeEventListener(FOCUS_EDITOR_EVENT, handleFocusEditor);
    };
  }, []);

  const backlinksButton =
    backlinks.length > 0 ? (
      <PopoverRoot>
        <PopoverTrigger
          render={
            <Button
              className="text-muted-foreground hover:bg-accent hover:text-accent-foreground pointer-events-auto"
              size="icon-sm"
              variant="ghost"
            />
          }
        >
          <Link2 className="size-[1.2rem]" />
        </PopoverTrigger>
        <PopoverPopup>
          <div className="p-3">
            <p className="text-muted-foreground mb-2 text-xs font-medium tracking-[0.08em] uppercase">
              Linked Mentions
            </p>
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {backlinks.map((backlink) => (
                <button
                  key={`${backlink.sourceNoteId}:${backlink.location}`}
                  className="hover:bg-accent block w-full rounded-md px-2.5 py-1.5 text-left transition-colors"
                  onClick={() => onSelectLinkedNote(backlink.sourceNoteId)}
                  type="button"
                >
                  <p className="truncate text-sm font-medium">
                    {backlink.sourceTitle || "Untitled"}
                  </p>
                  {backlink.sourcePreview ? (
                    <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
                      {backlink.sourcePreview}
                    </p>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        </PopoverPopup>
      </PopoverRoot>
    ) : null;

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
  if (isReadOnly) {
    let readOnlyTooltip = "Read-only";
    if (isViewingDeletedConflictSnapshot) {
      readOnlyTooltip = "Choose or merge a note version to edit";
    } else if (hasConflict) {
      readOnlyTooltip = "Resolve the conflict to edit";
    }

    toolbarSlot = (
      <Tooltip>
        <TooltipTrigger className="text-muted-foreground pointer-events-auto flex size-7 items-center justify-center rounded-[min(var(--radius-md),12px)]">
          <span aria-label={readOnlyTooltip} title={readOnlyTooltip}>
            <PencilOff className="size-[1.2rem]" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">{readOnlyTooltip}</TooltipContent>
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
          !notesPanelVisible && "pl-24",
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
            {backlinksButton}
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
        <EditorFindBar
          findQuery={findQuery}
          findMatchCount={findMatchCount}
          activeFindMatchIndex={activeFindMatchIndex}
          findInputRef={findInputRef}
          onQueryChange={setFindQuery}
          onResetMatchIndex={() => setActiveFindMatchIndex(0)}
          onFocus={ensureActiveFindMatch}
          onStepMatch={stepActiveFindMatch}
          onClose={closeFind}
          onClear={() => {
            setFindMatchCount(0);
            setFindQuery("");
            setActiveFindMatchIndex(0);
            findInputRef.current?.focus();
          }}
        />
      )}

      <div className="relative min-h-0 flex-1">
        <div
          className={cn(
            "h-full min-h-0 overflow-y-scroll overscroll-y-contain outline-none",
            !isReadOnly && "cursor-text",
            findOpen && "pt-2",
          )}
          data-editor-scroll-container
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
        <ConflictResolutionFooter
          viewedConflictSnapshot={viewedConflictSnapshot ?? null}
          viewedConflictSnapshotIndex={viewedConflictSnapshotIndex}
          viewableConflictSnapshots={viewableConflictSnapshots}
          isResolveConflictPending={isResolveConflictPending}
          readonly={readonly}
          onResolveConflict={onResolveConflict}
          onLoadConflictHead={onLoadConflictHead}
        />
      ) : null}
    </section>
  );
}
