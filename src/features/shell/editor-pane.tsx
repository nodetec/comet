import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { useUIStore } from "@/stores/use-ui-store";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Menu, Submenu } from "@tauri-apps/api/menu";
import { Ellipsis, PanelBottomOpen, PanelBottomClose } from "lucide-react";

import {
  NoteEditor,
  type NoteEditorHandle,
} from "@/components/editor/note-editor";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type NotebookRef, type NotebookSummary } from "./types";

type EditorPaneProps = {
  archivedAt: number | null;
  focusMode: "none" | "immediate" | "pointerup";
  isNewNote: boolean;
  markdown: string;
  notebook: NotebookRef | null;
  notebooks: NotebookSummary[];
  noteId: string | null;
  pinnedAt: number | null;
  searchQuery: string;
  onAssignNotebook(notebookId: string | null): void;
  onPublish(): void;
  onSetPinned(pinned: boolean): void;
  onFocusHandled(): void;
  onChange(markdown: string): void;
};

function firstLineH1Title(markdown: string) {
  const [firstLine = ""] = markdown.split("\n", 1);
  const match = firstLine.match(/^#\s+(.+?)\s*$/);
  return match?.[1] ?? null;
}

export function EditorPane({
  archivedAt,
  focusMode,
  isNewNote,
  markdown,
  notebook,
  notebooks,
  noteId,
  pinnedAt,
  searchQuery,
  onAssignNotebook,
  onPublish,
  onSetPinned,
  onFocusHandled,
  onChange,
}: EditorPaneProps) {
  const isArchived = archivedAt !== null;
  const editorRef = useRef<NoteEditorHandle | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [toolbarContainer, setToolbarContainer] = useState<HTMLDivElement | null>(null);
  const toolbarContainerRef = useCallback((node: HTMLDivElement | null) => {
    setToolbarContainer(node);
  }, []);
  const showToolbar = useUIStore((s) => s.showEditorToolbar);
  const setShowToolbar = useUIStore((s) => s.setShowEditorToolbar);
  const editorFontSize = useUIStore((s) => s.editorFontSize);
  const editorSpellCheck = useUIStore((s) => s.editorSpellCheck);
  const [showHeaderBorder, setShowHeaderBorder] = useState(false);
  const [showHeaderTitle, setShowHeaderTitle] = useState(false);
  const noteTitle = firstLineH1Title(markdown);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    updateHeaderState(scrollContainer);
  }, [noteId]);

  const updateHeaderState = (scrollContainer: HTMLDivElement | null) => {
    const scrolled = (scrollContainer?.scrollTop ?? 0) > 0;
    setShowHeaderBorder(scrolled);

    if (!scrollContainer || !noteId) {
      setShowHeaderTitle(false);
      return;
    }

    const firstLine = scrollContainer.querySelector("[data-lexical-editor] > :first-child") as
      | HTMLElement
      | null;

    if (!firstLine) {
      setShowHeaderTitle(false);
      return;
    }

    const scrollRect = scrollContainer.getBoundingClientRect();
    const firstLineRect = firstLine.getBoundingClientRect();
    setShowHeaderTitle(firstLineRect.bottom <= scrollRect.top);
  };

  const handleOpenMenu = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const buttonRect = event.currentTarget.getBoundingClientRect();
    const currentNotebookItem = notebook
      ? [
          {
            id: `editor-menu-notebook-current-${notebook.id}`,
            text: `Current: ${notebook.name}`,
            enabled: false,
          },
          {
            id: "editor-menu-notebook-none",
            text: "Remove from Notebook",
            action: () => {
              onAssignNotebook(null);
            },
          },
          { item: "Separator" as const },
        ]
      : [];
    const otherNotebookItems =
      notebooks.length > 0
        ? notebooks
            .filter((item) => item.id !== notebook?.id)
            .map((item) => ({
              id: `editor-menu-notebook-${item.id}`,
              text: item.name,
              action: () => {
                onAssignNotebook(item.id);
              },
            }))
        : [
            {
              id: "editor-menu-notebook-empty",
              text: "No notebooks yet",
              enabled: false,
            },
          ];
    const moveToNotebookSubmenu = await Submenu.new({
      text: "Move to Notebook",
      items: [...currentNotebookItem, ...otherNotebookItems],
    });

    const menu = await Menu.new({
      items: [
        {
          id: pinnedAt ? "editor-menu-unpin" : "editor-menu-pin",
          text: pinnedAt ? "Unpin" : "Pin To Top",
          action: () => {
            onSetPinned(!pinnedAt);
          },
        },
        moveToNotebookSubmenu,
        {
          id: "editor-menu-publish",
          text: "Publish to Nostr",
          action: () => {
            onPublish();
          },
        },
      ],
    });

    try {
      await menu.popup(
        new LogicalPosition(buttonRect.right - 170, buttonRect.bottom + 6),
      );
    } finally {
      await menu.close();
    }
  };

  const handleEditorSurfaceMouseDown = (
    event: MouseEvent<HTMLDivElement>,
  ) => {
    if (isArchived) {
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

  return (
    <section className="bg-background relative flex h-full min-h-0 flex-col">
      <header
        className={cn(
          "flex h-13 shrink-0 items-center justify-between gap-3 px-4",
          showHeaderBorder && "border-b",
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
        {noteId && !isArchived ? (
          <div className="pointer-events-none relative z-40 flex items-center gap-1">
            <Button
              className={cn(
                "text-muted-foreground hover:bg-accent hover:text-accent-foreground pointer-events-auto",
                showToolbar && "bg-accent text-accent-foreground",
              )}
              onClick={() => setShowToolbar(!showToolbar)}
              size="icon-sm"
              variant="ghost"
              title={showToolbar ? "Hide toolbar" : "Show toolbar"}
            >
              {showToolbar ? <PanelBottomClose className="size-[1.2rem]" /> : <PanelBottomOpen className="size-[1.2rem]" />}
            </Button>
            <Button
              className="text-muted-foreground hover:bg-accent hover:text-accent-foreground pointer-events-auto"
              onClick={(event) => void handleOpenMenu(event)}
              size="icon-sm"
              variant="ghost"
            >
              <Ellipsis className="size-[1.2rem]" />
            </Button>
          </div>
        ) : null}
      </header>

      <div
        className={cn("min-h-0 flex-1 overflow-y-scroll overscroll-y-contain", !isArchived && "cursor-text")}
        data-editor-scroll-container
        onMouseDown={handleEditorSurfaceMouseDown}
        onScroll={(event) => {
          updateHeaderState(event.currentTarget);
        }}
        ref={scrollContainerRef}
        style={{ "--editor-font-size": `${editorFontSize}px` } as React.CSSProperties}
        spellCheck={editorSpellCheck}
      >
        {noteId ? (
          <div className="relative flex min-h-full w-full flex-col">
            <NoteEditor
              focusMode={focusMode}
              isNew={isNewNote}
              key={noteId}
              markdown={markdown}
              onChange={onChange}
              onFocusHandled={onFocusHandled}
              readOnly={isArchived}
              ref={editorRef}
              searchQuery={searchQuery}
              toolbarContainer={toolbarContainer}
            />
          </div>
        ) : (
          <div className="border-border mx-auto flex max-w-2xl flex-col gap-4 rounded-md border border-dashed px-8">
            <p className="text-2xl font-semibold">Open a note to keep going.</p>
            <p className="text-muted-foreground text-sm leading-7">
              Comet will bias toward the note you were just in. Right now,
              choose one from the list or create a new note.
            </p>
          </div>
        )}
      </div>

      {noteId && !isArchived && showToolbar && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
          <div
            className="pointer-events-auto"
            ref={toolbarContainerRef}
          />
        </div>
      )}
    </section>
  );
}
