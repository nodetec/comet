import {
  type CSSProperties,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  type UIEvent,
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
import { useShellCommandStore } from "@/features/shell/store/use-shell-command-store";
import { useShellNavigationStore } from "@/features/shell/store/use-shell-navigation-store";
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
  const focusEditorRequest = useShellCommandStore(
    (state) => state.focusEditorRequest,
  );
  const editorFontSize = useEditorFontSize();
  const notesPanelVisible = useNotesPanelVisible();
  const showToolbar = useShowEditorToolbar();
  const editorSpellCheck = useEditorSpellCheck();
  const editorVimMode = useEditorVimMode();
  const { setShowEditorToolbar: setShowToolbar } = useUIActions();
  const { setFocusedPane } = useShellNavigationStore((state) => state.actions);
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
  const toolbarContainerRef = (node: HTMLDivElement | null) => {
    setToolbarContainer(node);
  };
  const editorLoadKey = noteId ? (editorKey ?? noteId) : null;
  const lastHandledFocusEditorRequestIdRef = useRef(0);

  const openEditorMenu = async (position: LogicalPosition) => {
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
  };

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

  const handleFocusEditor = useEffectEvent(
    (scrollTo: "preserve" | "top" = "preserve") => {
      if (!noteId) {
        return;
      }

      setFocusedPane("editor");
      requestAnimationFrame(() => {
        if (scrollTo === "top") {
          editorRef.current?.focusAtStart();
          scrollContainerRef.current?.scrollTo({ top: 0 });
          return;
        }

        editorRef.current?.focus();
      });
    },
  );

  useEffect(() => {
    if (
      !focusEditorRequest ||
      lastHandledFocusEditorRequestIdRef.current ===
        focusEditorRequest.requestId
    ) {
      return;
    }

    lastHandledFocusEditorRequestIdRef.current = focusEditorRequest.requestId;
    handleFocusEditor(focusEditorRequest.scrollTo);
  }, [focusEditorRequest, handleFocusEditor]);

  const headerActions =
    noteId !== null ? (
      <EditorPaneHeaderActions
        backlinks={backlinks}
        hasConflict={hasConflict}
        isPublishedNote={isPublishedNote}
        isReadOnly={isReadOnly}
        isViewingDeletedConflictSnapshot={isViewingDeletedConflictSnapshot}
        modifiedAt={modifiedAt}
        onOpenMenu={handleOpenMenu}
        onOpenPublishDialog={onOpenPublishDialog}
        onSelectLinkedNote={onSelectLinkedNote}
        onToggleToolbar={() => setShowToolbar(!showToolbar)}
        publishedAt={publishedAt}
        showToolbar={showToolbar}
      />
    ) : null;

  const banner =
    noteId !== null && hasConflict ? <EditorPaneConflictBanner /> : null;

  const findBar =
    findOpen && noteId ? (
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
    ) : null;

  const footer =
    noteId !== null && hasConflict ? (
      <ConflictResolutionFooter
        viewedConflictSnapshot={viewedConflictSnapshot ?? null}
        viewedConflictSnapshotIndex={viewedConflictSnapshotIndex}
        viewableConflictSnapshots={viewableConflictSnapshots}
        isResolveConflictPending={isResolveConflictPending}
        readonly={readonly}
        onResolveConflict={onResolveConflict}
        onLoadConflictHead={onLoadConflictHead}
      />
    ) : null;

  const frameProps = {
    banner,
    editorFontSize,
    editorSpellCheck,
    findBar,
    findOpen,
    headerActions,
    isReadOnly,
    noteTitle,
    notesPanelVisible,
    onEditorSurfaceMouseDown: handleEditorSurfaceMouseDown,
    onScrollContainerScroll: (event: UIEvent<HTMLDivElement>) => {
      scrollContainerCallbacks.onScroll(noteId, event.currentTarget.scrollTop);
      scrollContainerCallbacks.updateHeaderState(event.currentTarget);
    },
    scrollContainerRef,
    showHeaderBorder,
    showHeaderTitle,
    showToolbar,
    toolbarContainerRef,
  } satisfies Omit<EditorPaneFrameProps, "body" | "footer">;

  if (noteId === null) {
    return <EditorPaneFrame {...frameProps} body={<EditorPaneEmptyState />} />;
  }

  if (isViewingDeletedConflictSnapshot) {
    return (
      <EditorPaneFrame
        {...frameProps}
        body={<EditorPaneDeletedConflictState />}
        footer={footer}
      />
    );
  }

  return (
    <EditorPaneFrame
      {...frameProps}
      body={
        <div className="relative flex min-h-full w-full flex-col">
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
        </div>
      }
      footer={footer}
    />
  );
}

type EditorPaneFrameProps = {
  banner?: ReactNode;
  body: ReactNode;
  editorFontSize: number;
  editorSpellCheck: boolean;
  findBar?: ReactNode;
  findOpen: boolean;
  footer?: ReactNode;
  headerActions?: ReactNode;
  isReadOnly: boolean;
  noteTitle: string | null;
  notesPanelVisible: boolean;
  onEditorSurfaceMouseDown(event: MouseEvent<HTMLDivElement>): void;
  onScrollContainerScroll(event: UIEvent<HTMLDivElement>): void;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  showHeaderBorder: boolean;
  showHeaderTitle: boolean;
  showToolbar: boolean;
  toolbarContainerRef(node: HTMLDivElement | null): void;
};

type EditorPaneHeaderActionsProps = {
  backlinks: NoteBacklink[];
  hasConflict: boolean;
  isPublishedNote: boolean;
  isReadOnly: boolean;
  isViewingDeletedConflictSnapshot: boolean;
  modifiedAt: number;
  onOpenMenu(event: MouseEvent<HTMLButtonElement>): Promise<void>;
  onOpenPublishDialog(): void;
  onSelectLinkedNote(noteId: string): void;
  onToggleToolbar(): void;
  publishedAt: number | null;
  showToolbar: boolean;
};

function EditorPaneFrame({
  banner,
  body,
  editorFontSize,
  editorSpellCheck,
  findBar,
  findOpen,
  footer,
  headerActions,
  isReadOnly,
  noteTitle,
  notesPanelVisible,
  onEditorSurfaceMouseDown,
  onScrollContainerScroll,
  scrollContainerRef,
  showHeaderBorder,
  showHeaderTitle,
  showToolbar,
  toolbarContainerRef,
}: EditorPaneFrameProps) {
  return (
    <section className="bg-background relative flex h-full min-h-0 flex-col">
      <EditorPaneHeader
        actions={headerActions}
        findOpen={findOpen}
        noteTitle={noteTitle}
        notesPanelVisible={notesPanelVisible}
        showHeaderBorder={showHeaderBorder}
        showHeaderTitle={showHeaderTitle}
      />
      {banner}
      {findBar}
      <div className="relative min-h-0 flex-1">
        <div
          className={cn(
            "h-full min-h-0 overflow-y-scroll overscroll-y-contain outline-none",
            !isReadOnly && "cursor-text",
            findOpen && "pt-2",
          )}
          data-editor-scroll-container
          onMouseDown={onEditorSurfaceMouseDown}
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
          onScroll={onScrollContainerScroll}
          ref={scrollContainerRef}
          style={
            {
              "--editor-font-size": `${editorFontSize}px`,
            } as CSSProperties
          }
          spellCheck={editorSpellCheck}
        >
          {body}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {headerActions && !isReadOnly && showToolbar ? (
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

      {footer}
    </section>
  );
}

function EditorPaneHeader({
  actions,
  findOpen,
  noteTitle,
  notesPanelVisible,
  showHeaderBorder,
  showHeaderTitle,
}: {
  actions?: ReactNode;
  findOpen: boolean;
  noteTitle: string | null;
  notesPanelVisible: boolean;
  showHeaderBorder: boolean;
  showHeaderTitle: boolean;
}) {
  return (
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
      {actions ? (
        <div className="pointer-events-none relative z-40 flex items-center gap-1">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

function EditorPaneHeaderActions({
  backlinks,
  hasConflict,
  isPublishedNote,
  isReadOnly,
  isViewingDeletedConflictSnapshot,
  modifiedAt,
  onOpenMenu,
  onOpenPublishDialog,
  onSelectLinkedNote,
  onToggleToolbar,
  publishedAt,
  showToolbar,
}: EditorPaneHeaderActionsProps) {
  return (
    <>
      <EditorPaneStatus
        isPublishedNote={isPublishedNote}
        modifiedAt={modifiedAt}
        onOpenPublishDialog={onOpenPublishDialog}
        publishedAt={publishedAt}
      />
      <EditorPaneToolbarAction
        hasConflict={hasConflict}
        isReadOnly={isReadOnly}
        isViewingDeletedConflictSnapshot={isViewingDeletedConflictSnapshot}
        onToggleToolbar={onToggleToolbar}
        showToolbar={showToolbar}
      />
      <EditorPaneBacklinksButton
        backlinks={backlinks}
        onSelectLinkedNote={onSelectLinkedNote}
      />
      <Button
        className="text-muted-foreground hover:bg-accent hover:text-accent-foreground pointer-events-auto"
        onClick={(event) => {
          void onOpenMenu(event);
        }}
        size="icon-sm"
        variant="ghost"
      >
        <Ellipsis className="size-[1.2rem]" />
      </Button>
    </>
  );
}

function EditorPaneStatus({
  isPublishedNote,
  modifiedAt,
  onOpenPublishDialog,
  publishedAt,
}: {
  isPublishedNote: boolean;
  modifiedAt: number;
  onOpenPublishDialog(): void;
  publishedAt: number | null;
}) {
  if (isPublishedNote) {
    return (
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
  }

  if (publishedAt == null) {
    return null;
  }

  if (modifiedAt <= publishedAt) {
    return (
      <span className="text-muted-foreground pointer-events-auto text-xs">
        Published
      </span>
    );
  }

  return (
    <button
      className="text-muted-foreground hover:text-foreground pointer-events-auto cursor-default text-xs transition-colors"
      onClick={onOpenPublishDialog}
      type="button"
    >
      Update
    </button>
  );
}

function EditorPaneToolbarAction({
  hasConflict,
  isReadOnly,
  isViewingDeletedConflictSnapshot,
  onToggleToolbar,
  showToolbar,
}: {
  hasConflict: boolean;
  isReadOnly: boolean;
  isViewingDeletedConflictSnapshot: boolean;
  onToggleToolbar(): void;
  showToolbar: boolean;
}) {
  if (isReadOnly) {
    let readOnlyTooltip = "Read-only";
    if (isViewingDeletedConflictSnapshot) {
      readOnlyTooltip = "Choose or merge a note version to edit";
    } else if (hasConflict) {
      readOnlyTooltip = "Resolve the conflict to edit";
    }

    return (
      <Tooltip>
        <TooltipTrigger className="text-muted-foreground pointer-events-auto flex size-7 items-center justify-center rounded-[min(var(--radius-md),12px)]">
          <span aria-label={readOnlyTooltip} title={readOnlyTooltip}>
            <PencilOff className="size-[1.2rem]" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">{readOnlyTooltip}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button
      className="text-muted-foreground hover:bg-accent hover:text-accent-foreground pointer-events-auto"
      onClick={onToggleToolbar}
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

function EditorPaneBacklinksButton({
  backlinks,
  onSelectLinkedNote,
}: {
  backlinks: NoteBacklink[];
  onSelectLinkedNote(noteId: string): void;
}) {
  if (backlinks.length === 0) {
    return null;
  }

  return (
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
  );
}

function EditorPaneConflictBanner() {
  return (
    <div className="border-primary/20 bg-primary/10 sticky top-0 z-30 border-b px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">
          Conflicting note versions detected
        </p>
      </div>
    </div>
  );
}

function EditorPaneDeletedConflictState() {
  return (
    <div className="flex min-h-full items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <p className="text-foreground text-sm font-medium">
          This version deletes the note
        </p>
        <p className="text-muted-foreground mt-2 text-sm">
          Use the conflict actions below to keep the deletion, restore the note,
          or merge a new version.
        </p>
      </div>
    </div>
  );
}

function EditorPaneEmptyState() {
  return (
    <div className="flex h-full items-center justify-center">
      <img
        src={cometLogo}
        alt=""
        className="size-32 opacity-50"
        draggable={false}
      />
    </div>
  );
}
