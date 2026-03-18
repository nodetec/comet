import { useCallback, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";

import {
  NoteEditor,
  type NoteEditorHandle,
} from "@/components/editor/note-editor";
import { useUIStore } from "@/stores/use-ui-store";
import { type NotebookRef, type NotebookSummary } from "@/features/shell/types";

type MobileEditorProps = {
  archivedAt: number | null;
  deletedAt: number | null;
  editorKey: string | null;
  focusMode: "none" | "immediate" | "pointerup";
  isDeletePublishedNotePending: boolean;
  isNewNote: boolean;
  markdown: string;
  modifiedAt: number;
  notebook: NotebookRef | null;
  notebooks: NotebookSummary[];
  noteId: string | null;
  pinnedAt: number | null;
  publishedAt: number | null;
  publishedKind: number | null;
  searchQuery: string;
  onAssignNotebook(notebookId: string | null): void;
  onDeletePublishedNote(): void;
  onOpenPublishDialog(): void;
  onPublishShortNote(): void;
  onSetPinned(pinned: boolean): void;
  onFocusHandled(): void;
  onChange(markdown: string): void;
  onBack(): void;
};

function firstLineH1Title(markdown: string) {
  const [firstLine = ""] = markdown.split("\n", 1);
  const match = firstLine.match(/^#\s+(.+?)\s*$/);
  return match?.[1] ?? null;
}

export function MobileEditor({
  archivedAt,
  deletedAt,
  editorKey,
  focusMode,
  isNewNote,
  markdown,
  noteId,
  publishedKind,
  searchQuery,
  onFocusHandled,
  onChange,
  onBack,
}: MobileEditorProps) {
  const isArchived = archivedAt !== null;
  const isPublishedNote = publishedKind === 1;
  const isReadOnly = isArchived || deletedAt !== null || isPublishedNote;
  const editorRef = useRef<NoteEditorHandle | null>(null);
  const editorFontSize = useUIStore((s) => s.editorFontSize);
  const editorSpellCheck = useUIStore((s) => s.editorSpellCheck);
  const [toolbarContainer, setToolbarContainer] =
    useState<HTMLDivElement | null>(null);
  const toolbarContainerRef = useCallback((node: HTMLDivElement | null) => {
    setToolbarContainer(node);
  }, []);

  const noteTitle = firstLineH1Title(markdown);

  return (
    <section className="bg-background flex h-full min-h-0 flex-col">
      <header className="border-divider shrink-0 border-b px-4 pt-[env(safe-area-inset-top)]">
        <div className="flex h-12 items-center justify-between">
          <button
            className="text-primary -ml-1 flex items-center gap-0.5 text-sm"
            onClick={onBack}
            type="button"
          >
            <ChevronLeft className="size-5" />
            Notes
          </button>
          <div className="min-w-0 flex-1 px-4">
            <p className="truncate text-center text-sm font-medium">
              {noteTitle ?? ""}
            </p>
          </div>
          <div className="flex items-center">
            {/* Future: more actions menu */}
          </div>
        </div>
      </header>

      <div
        className={`min-h-0 flex-1 overflow-y-auto overscroll-y-contain ${!isReadOnly ? "cursor-text" : ""}`}
        data-editor-scroll-container
        onMouseDown={(e) => {
          if (isReadOnly) return;
          const target = e.target as HTMLElement;
          if (
            target.closest(
              "button, input, textarea, select, a, [role='button']",
            )
          )
            return;
          if (target.closest("[data-lexical-editor]")) return;
          editorRef.current?.focus();
        }}
        style={
          {
            "--editor-font-size": `${editorFontSize}px`,
            paddingBottom: "env(safe-area-inset-bottom)",
          } as React.CSSProperties
        }
        spellCheck={editorSpellCheck}
      >
        {noteId ? (
          <div className="relative flex min-h-full w-full flex-col">
            <NoteEditor
              focusMode={focusMode}
              isNew={isNewNote}
              key={editorKey ?? noteId}
              markdown={markdown}
              onChange={onChange}
              onFocusHandled={onFocusHandled}
              readOnly={isReadOnly}
              ref={editorRef}
              searchQuery={searchQuery}
              toolbarContainer={toolbarContainer}
            />
          </div>
        ) : null}
      </div>

      {noteId && !isReadOnly && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
          <div className="pointer-events-auto" ref={toolbarContainerRef} />
        </div>
      )}
    </section>
  );
}
