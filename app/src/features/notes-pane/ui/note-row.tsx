import { type MouseEvent } from "react";
import { formatDistanceToNow } from "date-fns";
import { GitMergeConflict, Pin } from "lucide-react";
import { motion } from "framer-motion";

import {
  uiStore,
  useSidebarVisible,
} from "@/features/settings/store/use-ui-store";
import { useShellNavigationStore } from "@/features/shell/store/use-shell-navigation-store";
import { dispatchFocusEditor } from "@/shared/lib/pane-navigation";
import {
  type NoteListNavigationDirection,
  getNoteListNavigationDirectionForKey,
} from "@/features/notes-pane/lib/note-list-navigation";
import { type NoteSummary } from "@/shared/api/types";

import { HighlightedText } from "@/features/notes-pane/ui/highlighted-text";
import {
  handleNoteRowPointerDown,
  noteCardPreview,
  noteRowClassName,
} from "@/features/notes-pane/ui/notes-pane-utils";

export type NoteRowProps = {
  focusedPane: "sidebar" | "notes" | "editor";
  highlightWords: string[];
  isJustCreated: boolean;
  isMutatingNote: boolean;
  isNextActive: boolean;
  isSearchFocused: boolean;
  note: NoteSummary;
  onContextMenu(event: MouseEvent<HTMLButtonElement>, note: NoteSummary): void;
  onMoveSelection(direction: NoteListNavigationDirection): void;
  onRowRef(noteId: string, element: HTMLButtonElement | null): void;
  onSelectNote(noteId: string): void;
  searchWords: string[];
  selectedNoteId: string | null;
  setSlideInNoteId(noteId: string | null): void;
  setShouldRestoreSelectedRowFocus(): void;
  shouldSkipAnimation: boolean;
};

export function NoteRow({
  focusedPane,
  highlightWords,
  isJustCreated,
  isMutatingNote,
  isNextActive,
  isSearchFocused,
  note,
  onContextMenu,
  onMoveSelection,
  onRowRef,
  onSelectNote,
  searchWords,
  selectedNoteId,
  setSlideInNoteId,
  setShouldRestoreSelectedRowFocus,
  shouldSkipAnimation,
}: NoteRowProps) {
  const isActive = note.id === selectedNoteId;
  const cardPreview = noteCardPreview(note, searchWords);
  const sidebarVisible = useSidebarVisible();
  const { setFocusedPane } = useShellNavigationStore((state) => state.actions);

  return (
    <motion.div
      layout="position"
      transition={{
        layout: {
          duration: shouldSkipAnimation ? 0 : 0.2,
          ease: "easeInOut",
        },
      }}
      className={`flex w-full flex-col items-center ${isJustCreated ? "animate-slide-in-left" : ""}`}
      key={note.id}
      onAnimationEnd={() => {
        if (isJustCreated) setSlideInNoteId(null);
      }}
    >
      <button
        className={noteRowClassName({
          focusedPane,
          isActive,
          isSearchFocused,
        })}
        data-comet-selected-note={isActive ? "true" : undefined}
        ref={(element) => {
          onRowRef(note.id, element);
        }}
        onClick={() => onSelectNote(note.id)}
        onContextMenu={(event) => onContextMenu(event, note)}
        onFocus={() => {
          setFocusedPane("notes");
        }}
        onKeyDown={(event) => {
          if (event.metaKey || event.ctrlKey || event.altKey) {
            return;
          }

          const lowerKey = event.key.toLowerCase();
          const direction = getNoteListNavigationDirectionForKey(event.key);
          if (direction) {
            event.preventDefault();
            onMoveSelection(direction);
            return;
          }

          if (event.key === "Enter" || lowerKey === "o") {
            event.preventDefault();
            dispatchFocusEditor({ scrollTo: "top" });
            return;
          }

          if (lowerKey === "l") {
            event.preventDefault();
            dispatchFocusEditor();
            return;
          }

          if (event.key === "Escape" || lowerKey === "h") {
            event.preventDefault();
            if (!sidebarVisible) {
              uiStore.getState().actions.toggleSidebar();
            }
            setFocusedPane("sidebar");
          }
        }}
        onPointerDown={(event) => {
          handleNoteRowPointerDown(event);
          setShouldRestoreSelectedRowFocus();
        }}
        onMouseDown={(event) => {
          if (event.button === 2) {
            event.preventDefault();
          }
        }}
        disabled={isMutatingNote}
        type="button"
      >
        <div className="flex w-full flex-1 flex-col gap-1.5">
          {note.title || !note.preview ? (
            <h3
              className={`min-w-0 truncate font-semibold ${note.title ? "text-[var(--heading-color)]" : "text-muted-foreground"}`}
            >
              <HighlightedText
                highlightWords={highlightWords}
                text={note.title || "Untitled"}
              />
            </h3>
          ) : null}
          <div className="min-w-0 flex-1 overflow-hidden">
            <p
              className={`text-muted-foreground text-sm break-all whitespace-break-spaces ${note.title || !note.preview ? "line-clamp-2" : "line-clamp-3"}`}
            >
              <HighlightedText
                highlightWords={highlightWords}
                text={cardPreview}
              />
            </p>
          </div>
          <div className="flex w-full items-center gap-1.5">
            {note.pinnedAt ? (
              <Pin className="text-primary/80 size-3 shrink-0 fill-current" />
            ) : null}
            {note.hasConflict ? (
              <GitMergeConflict className="text-primary/80 size-3 shrink-0" />
            ) : null}
            <span className="text-muted-foreground/70 min-w-0 truncate text-xs">
              {Date.now() - note.editedAt < 60_000
                ? "just now"
                : formatDistanceToNow(new Date(note.editedAt), {
                    addSuffix: true,
                  }).replace(/^about /, "")}
            </span>
          </div>
        </div>
      </button>
      <div className="w-full px-[0.30rem]">
        <div
          className={`h-px w-full ${isActive || isNextActive ? "bg-transparent" : "bg-accent/35"}`}
        />
      </div>
    </motion.div>
  );
}
