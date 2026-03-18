import { memo, useEffect, useMemo, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Menu as MenuIcon,
  PenBoxIcon,
  Pin,
  Search,
  X,
} from "lucide-react";
import Highlighter from "react-highlight-words";
import { useInView } from "react-intersection-observer";

import { Button } from "@/components/ui/button";
import { searchWordsFromQuery } from "@/lib/search";
import { type NoteFilter } from "@/stores/use-shell-store";
import {
  notesHeading,
  type NotebookSummary,
  type NoteSortDirection,
  type NoteSortField,
  type NoteSummary,
} from "@/features/shell/types";

type MobileNotesListProps = {
  activeNotebook: NotebookSummary | null;
  activeTags: string[];
  creatingNoteId: string | null;
  filteredNotes: NoteSummary[];
  hasMoreNotes: boolean | undefined;
  isCreatingNote: boolean;
  isLoadingMoreNotes: boolean;
  isMutatingNote: boolean;
  notebooks: NotebookSummary[];
  noteFilter: NoteFilter;
  searchQuery: string;
  selectedNoteId: string | null;
  sortField: NoteSortField;
  sortDirection: NoteSortDirection;
  totalNoteCount: number;
  onAssignNoteNotebook(noteId: string, notebookId: string | null): void;
  onArchiveNote(noteId: string): void;
  onChangeSearch(query: string): void;
  onChangeSortField(field: NoteSortField): void;
  onChangeSortDirection(direction: NoteSortDirection): void;
  onCopyNoteContent(noteId: string): void;
  onCreateNote(source: "keyboard" | "pointer"): void;
  onDeleteNotePermanently(noteId: string): void;
  onLoadMore(): void;
  onRestoreFromTrash(noteId: string): void;
  onSetNotePinned(noteId: string, pinned: boolean): void;
  onExportNotes(): void;
  onRestoreNote(noteId: string): void;
  onTrashNote(noteId: string): void;
  onSelectNote(noteId: string): void;
  onOpenSidebar(): void;
};

const HighlightedText = memo(function HighlightedText({
  text,
  searchWords,
}: {
  text: string;
  searchWords: string[];
}) {
  if (searchWords.length === 0 || text.length === 0) {
    return <>{text}</>;
  }

  return (
    <Highlighter
      autoEscape
      highlightClassName="bg-yellow-300 text-background rounded-[3px] px-[0.08rem]"
      searchWords={searchWords}
      textToHighlight={text}
    />
  );
});

export function MobileNotesList({
  activeNotebook,
  filteredNotes,
  hasMoreNotes,
  isCreatingNote,
  isLoadingMoreNotes,
  isMutatingNote,
  noteFilter,
  searchQuery,
  selectedNoteId,
  onChangeSearch,
  onCreateNote,
  onLoadMore,
  onSelectNote,
  onOpenSidebar,
}: MobileNotesListProps) {
  const isArchive = noteFilter === "archive";
  const isTrash = noteFilter === "trash";
  const [isSearchOpen, setIsSearchOpen] = useState(
    () => searchQuery.length > 0,
  );
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const { ref: loadMoreRef, inView } = useInView({
    rootMargin: "160px 0px",
  });
  const searchWords = useMemo(
    () => searchWordsFromQuery(searchQuery),
    [searchQuery],
  );

  useEffect(() => {
    if (isSearchOpen) {
      searchInputRef.current?.focus();
    }
  }, [isSearchOpen]);

  useEffect(() => {
    if (!inView || !hasMoreNotes) return;
    onLoadMore();
  }, [hasMoreNotes, inView, onLoadMore]);

  return (
    <section className="bg-background flex h-full min-h-0 flex-col">
      <header className="border-divider shrink-0 border-b px-4 pt-[env(safe-area-inset-top)]">
        <div className="flex h-12 items-center justify-between">
          {isSearchOpen ? (
            <label className="relative w-full">
              <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <input
                className="border-input/60 placeholder:text-muted-foreground focus:border-primary h-9 w-full rounded-lg border bg-transparent py-1 pr-9 pl-9 text-base outline-none"
                onChange={(e) => onChangeSearch(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    if (searchQuery) onChangeSearch("");
                    setIsSearchOpen(false);
                  }
                }}
                placeholder="Search..."
                ref={searchInputRef}
                value={searchQuery}
              />
              <Button
                className="text-muted-foreground absolute top-1/2 right-1 -translate-y-1/2"
                onClick={() => {
                  onChangeSearch("");
                  setIsSearchOpen(false);
                }}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <X className="size-4" />
              </Button>
            </label>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <button
                  className="text-primary -ml-1 p-1"
                  onClick={onOpenSidebar}
                  type="button"
                >
                  <MenuIcon className="size-5" />
                </button>
                <h2 className="text-lg font-semibold">
                  {notesHeading(noteFilter, activeNotebook)}
                </h2>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  className="text-muted-foreground"
                  onClick={() => setIsSearchOpen(true)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <Search className="size-5" />
                </Button>
                <Button
                  className="text-muted-foreground"
                  disabled={isCreatingNote || isArchive || isTrash}
                  onClick={() => onCreateNote("pointer")}
                  size="icon-sm"
                  variant="ghost"
                >
                  <PenBoxIcon className="size-5" />
                </Button>
              </div>
            </>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-[env(safe-area-inset-bottom)]">
        {filteredNotes.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-muted-foreground text-lg">No Notes</p>
          </div>
        ) : (
          <>
            <div className="divide-accent/35 divide-y px-4">
              {filteredNotes.map((note) => {
                const isActive = note.id === selectedNoteId;
                const fallback = note.title ? "" : "No content yet";
                const cardPreview =
                  searchWords.length > 0
                    ? note.searchSnippet || note.preview || fallback
                    : note.preview || fallback;

                return (
                  <button
                    className={`flex w-full flex-col items-start gap-1.5 py-3 text-left ${isActive ? "opacity-70" : ""}`}
                    key={note.id}
                    onClick={() => onSelectNote(note.id)}
                    disabled={isMutatingNote}
                    type="button"
                  >
                    {(note.title || !note.preview) && (
                      <h3
                        className={`w-full truncate font-semibold ${note.title ? "text-[var(--heading-color)]" : "text-muted-foreground"}`}
                      >
                        <HighlightedText
                          text={note.title || "Untitled"}
                          searchWords={searchWords}
                        />
                      </h3>
                    )}
                    <p
                      className={`text-muted-foreground w-full text-sm break-all whitespace-break-spaces ${note.title || !note.preview ? "line-clamp-2" : "line-clamp-3"}`}
                    >
                      <HighlightedText
                        text={cardPreview}
                        searchWords={searchWords}
                      />
                    </p>
                    <div className="flex w-full items-center gap-1.5">
                      {note.pinnedAt && (
                        <Pin className="text-primary/80 size-3 shrink-0 fill-current" />
                      )}
                      <span className="text-muted-foreground/70 text-xs">
                        {Date.now() - note.editedAt < 60_000
                          ? "just now"
                          : formatDistanceToNow(new Date(note.editedAt), {
                              addSuffix: true,
                            }).replace(/^about /, "")}
                      </span>
                      {note.notebook && (
                        <span className="text-primary ml-auto text-xs">
                          {note.notebook.name}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            {hasMoreNotes && (
              <div className="py-4 text-center" ref={loadMoreRef}>
                <span className="text-muted-foreground text-xs">
                  {isLoadingMoreNotes ? "Loading more..." : ""}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
