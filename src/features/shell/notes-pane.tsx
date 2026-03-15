import { LogicalPosition } from "@tauri-apps/api/dpi";
import { formatDistanceToNow } from "date-fns";
import { LayoutGroup, motion } from "framer-motion";
import {
  CheckMenuItem,
  Menu,
  PredefinedMenuItem,
  Submenu,
} from "@tauri-apps/api/menu";
import { ChevronDown, PenBoxIcon, Pin, Search, X } from "lucide-react";
import Highlighter from "react-highlight-words";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
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
} from "./types";

type NotesPaneProps = {
  activeNotebook: NotebookSummary | null;
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
  onAssignNoteNotebook(noteId: string, notebookId: string | null): void;
  onArchiveNote(noteId: string): void;
  onChangeSearch(query: string): void;
  onChangeSortField(field: NoteSortField): void;
  onChangeSortDirection(direction: NoteSortDirection): void;
  onCopyNoteContent(noteId: string): void;
  onCreateNote(source: "keyboard" | "pointer"): void;
  onDeleteNotePermanently(noteId: string): void;
  onLoadMore(): void;
  onSetNotePinned(noteId: string, pinned: boolean): void;
  onRestoreNote(noteId: string): void;
  onSelectNote(noteId: string): void;
};

function handleCreateButtonPointerDown(
  event: PointerEvent<HTMLButtonElement>,
  isCreatingNote: boolean,
  onCreateNote: (source: "keyboard" | "pointer") => void,
) {
  event.preventDefault();

  if (event.pointerType !== "mouse" || isCreatingNote) {
    return;
  }

  onCreateNote("pointer");
}

function handleCreateButtonClick(
  event: MouseEvent<HTMLButtonElement>,
  onCreateNote: (source: "keyboard" | "pointer") => void,
) {
  if (event.detail !== 0) {
    return;
  }

  onCreateNote("keyboard");
}

function renderHighlightedText(text: string, searchWords: string[]) {
  if (searchWords.length === 0 || text.length === 0) {
    return text;
  }

  return (
    <Highlighter
      autoEscape
      highlightClassName="bg-yellow-300/40 text-secondary-foreground rounded-[3px] px-[0.08rem] [box-decoration-break:clone] [-webkit-box-decoration-break:clone]"
      searchWords={searchWords}
      textToHighlight={text}
    />
  );
}

export function NotesPane({
  activeNotebook,
  filteredNotes,
  hasMoreNotes,
  isCreatingNote,
  isLoadingMoreNotes,
  isMutatingNote,
  notebooks,
  noteFilter,
  searchQuery,
  selectedNoteId,
  sortField,
  sortDirection,
  onAssignNoteNotebook,
  onArchiveNote,
  onChangeSearch,
  onChangeSortField,
  onChangeSortDirection,
  onCopyNoteContent,
  onCreateNote,
  onDeleteNotePermanently,
  onLoadMore,
  onSetNotePinned,
  onRestoreNote,
  onSelectNote,
}: NotesPaneProps) {
  const isArchive = noteFilter === "archive";
  const [isSearchOpen, setIsSearchOpen] = useState(
    () => searchQuery.length > 0,
  );
  const [showHeaderBorder, setShowHeaderBorder] = useState(false);
  const knownNoteIdsRef = useRef<Set<string>>(new Set());
  const newNoteIds = useMemo(() => {
    const newIds = new Set<string>();
    for (const note of filteredNotes) {
      if (!knownNoteIdsRef.current.has(note.id)) {
        newIds.add(note.id);
      }
    }
    return newIds;
  }, [filteredNotes]);
  useEffect(() => {
    for (const note of filteredNotes) {
      knownNoteIdsRef.current.add(note.id);
    }
  }, [filteredNotes]);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const { ref: loadMoreRef, inView } = useInView({
    rootMargin: "160px 0px",
  });
  const searchWords = useMemo(
    () => searchWordsFromQuery(searchQuery),
    [searchQuery],
  );
  useEffect(() => {
    if (searchQuery) {
      setIsSearchOpen(true);
    }
  }, [searchQuery]);

  useEffect(() => {
    if (!isSearchOpen) {
      return;
    }

    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, [isSearchOpen]);

  useEffect(() => {
    setShowHeaderBorder((scrollContainerRef.current?.scrollTop ?? 0) > 0);
  }, [activeNotebook?.id, filteredNotes.length, noteFilter, searchQuery]);

  useEffect(() => {
    if (!inView || !hasMoreNotes) {
      return;
    }

    onLoadMore();
  }, [hasMoreNotes, inView, onLoadMore]);

  const handleNoteContextMenu = async (
    event: MouseEvent<HTMLButtonElement>,
    note: NoteSummary,
  ) => {
    event.preventDefault();
    const moveToNotebookSubmenu =
      !isArchive &&
      (await Submenu.new({
        text: "Move to Notebook",
        items: [
          ...(note.notebook
            ? [
                {
                  id: `note-menu-notebook-current-${note.id}-${note.notebook.id}`,
                  text: `Current: ${note.notebook.name}`,
                  enabled: false,
                },
                {
                  id: `note-menu-notebook-none-${note.id}`,
                  text: "Remove from Notebook",
                  action: () => {
                    onAssignNoteNotebook(note.id, null);
                  },
                },
                { item: "Separator" as const },
              ]
            : []),
          ...(notebooks.length > 0
            ? notebooks
                .filter((item) => item.id !== note.notebook?.id)
                .map((item) => ({
                  id: `note-menu-notebook-${note.id}-${item.id}`,
                  text: item.name,
                  action: () => {
                    onAssignNoteNotebook(note.id, item.id);
                  },
                }))
            : [
                {
                  id: `note-menu-notebook-empty-${note.id}`,
                  text: "No notebooks yet",
                  enabled: false,
                },
              ]),
        ],
      }));

    const menu = await Menu.new({
      items: isArchive
        ? [
            {
              id: `restore-${note.id}`,
              text: "Restore",
              action: () => onRestoreNote(note.id),
            },
            {
              id: `delete-forever-${note.id}`,
              text: "Delete Permanently",
              action: () => onDeleteNotePermanently(note.id),
            },
          ]
        : [
            {
              id: `copy-${note.id}`,
              text: "Copy",
              action: () => onCopyNoteContent(note.id),
            },
            { item: "Separator" as const },
            {
              id: `${note.pinnedAt ? "unpin" : "pin"}-${note.id}`,
              text: note.pinnedAt ? "Unpin" : "Pin To Top",
              action: () => onSetNotePinned(note.id, !note.pinnedAt),
            },
            ...(moveToNotebookSubmenu ? [moveToNotebookSubmenu] : []),
            {
              id: `archive-${note.id}`,
              text: "Archive",
              action: () => onArchiveNote(note.id),
            },
          ],
    });

    try {
      await menu.popup(new LogicalPosition(event.clientX, event.clientY));
    } finally {
      await menu.close();
    }
  };

  return (
    <section className="bg-background flex h-full min-h-0 flex-col">
      <header
        className={[
          "h-[52px] w-full shrink-0 px-3",
          showHeaderBorder ? "border-b" : "",
        ].join(" ")}
      >
        <div className="flex h-full items-center justify-between">
          {isSearchOpen ? (
            <label className="relative z-40 w-full">
              <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <input
                className="border-input/60 placeholder:text-muted-foreground focus:border-primary h-8 w-full rounded-md border bg-transparent py-1 pr-8 pl-9 text-sm outline-none"
                onChange={(event) => onChangeSearch(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    if (searchQuery) {
                      onChangeSearch("");
                    }

                    setIsSearchOpen(false);
                  }
                }}
                placeholder="Search…"
                ref={searchInputRef}
                value={searchQuery}
              />
              <Button
                className="text-muted-foreground hover:bg-accent hover:text-accent-foreground absolute top-1/2 right-1 z-10 -translate-y-1/2"
                onClick={() => {
                  onChangeSearch("");
                  setIsSearchOpen(false);
                }}
                onMouseDown={(event) => event.preventDefault()}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <X className="size-3.5" />
              </Button>
            </label>
          ) : (
            <>
              <div className="relative z-40 flex min-w-0 items-center gap-1">
                <button
                  className="flex max-w-full min-w-0 cursor-default items-center gap-0.5 rounded-md px-1.5 py-0.5"
                  onClick={async (event) => {
                    const button = event.currentTarget;
                    const rect = button.getBoundingClientRect();

                    const isDateField = sortField !== "title";
                    const newestLabel = isDateField ? "Newest First" : "A to Z";
                    const oldestLabel = isDateField ? "Oldest First" : "Z to A";

                    const sortSubmenu = await Submenu.new({
                      text: "Sort By",
                      items: [
                        await CheckMenuItem.new({
                          id: "sort-modified_at",
                          text: "Modification Date",
                          checked: sortField === "modified_at",
                          action: () => onChangeSortField("modified_at"),
                        }),
                        await CheckMenuItem.new({
                          id: "sort-created_at",
                          text: "Creation Date",
                          checked: sortField === "created_at",
                          action: () => onChangeSortField("created_at"),
                        }),
                        await CheckMenuItem.new({
                          id: "sort-title",
                          text: "Title",
                          checked: sortField === "title",
                          action: () => onChangeSortField("title"),
                        }),
                        await PredefinedMenuItem.new({ item: "Separator" }),
                        await CheckMenuItem.new({
                          id: "dir-newest",
                          text: newestLabel,
                          checked: sortDirection === "newest",
                          action: () => onChangeSortDirection("newest"),
                        }),
                        await CheckMenuItem.new({
                          id: "dir-oldest",
                          text: oldestLabel,
                          checked: sortDirection === "oldest",
                          action: () => onChangeSortDirection("oldest"),
                        }),
                      ],
                    });

                    const menu = await Menu.new({ items: [sortSubmenu] });
                    try {
                      await menu.popup(
                        new LogicalPosition(rect.left, rect.bottom),
                      );
                    } finally {
                      await menu.close();
                    }
                  }}
                  type="button"
                >
                  <h2 className="min-w-0 truncate font-medium">
                    {notesHeading(noteFilter, activeNotebook)}
                  </h2>
                  <ChevronDown className="text-muted-foreground size-4 shrink-0" />
                </button>
              </div>
              <div className="relative z-40 flex items-center gap-2">
                <Button
                  className="text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    setIsSearchOpen(true);
                  }}
                  onMouseDown={(event) => event.preventDefault()}
                  size="icon-sm"
                  variant="ghost"
                >
                  <Search className="size-[1.2rem]" />
                </Button>
                <Button
                  className="text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  disabled={isCreatingNote}
                  onClick={(event) =>
                    handleCreateButtonClick(event, onCreateNote)
                  }
                  onMouseDown={(event) => event.preventDefault()}
                  onPointerDown={(event) =>
                    handleCreateButtonPointerDown(
                      event,
                      isCreatingNote,
                      onCreateNote,
                    )
                  }
                  size="icon-sm"
                  variant="ghost"
                >
                  <PenBoxIcon className="size-[1.2rem]" />
                </Button>
              </div>
            </>
          )}
        </div>
      </header>

      <div
        className="min-h-0 flex-1 overflow-y-scroll overscroll-y-contain select-none"
        onScroll={(event) => {
          setShowHeaderBorder(event.currentTarget.scrollTop > 0);
        }}
        ref={scrollContainerRef}
      >
        {filteredNotes.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-muted-foreground text-xl">No Notes</p>
          </div>
        ) : (
          <div className="space-y-0 px-3">
            <LayoutGroup>
            {filteredNotes.map((note) => {
              const isActive = note.id === selectedNoteId;
              const isNew = newNoteIds.has(note.id);
              const cardPreview =
                searchWords.length > 0
                  ? note.searchSnippet || note.preview || "No content yet"
                  : note.preview || "No content yet";

              return (
                <motion.div
                  layout
                  transition={{ layout: { duration: 0.2, ease: "easeInOut" } }}
                  className={`flex w-full flex-col items-center ${isNew ? "animate-slide-in-left" : ""}`}
                  key={note.id}
                >
                  <button
                    className={[
                      "relative flex h-[6.75rem] w-full cursor-default flex-col items-start gap-2 overflow-hidden rounded-md px-2.5 py-2.5 text-left text-sm",
                      isActive ? "bg-accent/50" : "",
                    ].join(" ")}
                    onClick={() => onSelectNote(note.id)}
                    onContextMenu={(event) =>
                      void handleNoteContextMenu(event, note)
                    }
                    onMouseDown={(event) => {
                      if (event.button === 2) {
                        event.preventDefault();
                      }
                    }}
                    disabled={isMutatingNote}
                    type="button"
                  >
                    <div className="flex w-full flex-1 flex-col gap-1.5">
                      {note.title ? (
                        <h3 className="text-secondary-foreground min-w-0 truncate font-semibold">
                          {renderHighlightedText(note.title, searchWords)}
                        </h3>
                      ) : null}
                      <div
                        className={`text-muted-foreground min-w-0 flex-1 overflow-hidden text-sm break-all whitespace-break-spaces ${note.title ? "line-clamp-2" : "line-clamp-3"}`}
                      >
                        {renderHighlightedText(cardPreview, searchWords)}
                      </div>
                      <div className="flex w-full items-center gap-3">
                        {note.pinnedAt ? (
                          <Pin className="text-primary/80 size-3 shrink-0 fill-current" />
                        ) : null}
                        <span className="text-muted-foreground/70 text-xs">
                          {Date.now() - note.modifiedAt < 60_000
                            ? "just now"
                            : formatDistanceToNow(new Date(note.modifiedAt), {
                                addSuffix: true,
                              })}
                        </span>
                      </div>
                    </div>
                  </button>
                  <div className="w-full px-[0.30rem]">
                    <div className="bg-accent/35 h-px w-full" />
                  </div>
                </motion.div>
              );
            })}
            </LayoutGroup>
            {hasMoreNotes ? (
              <div className="px-[0.30rem] py-4" ref={loadMoreRef}>
                <div className="text-muted-foreground text-center text-xs">
                  {isLoadingMoreNotes ? "Loading more notes…" : ""}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
