import { LogicalPosition } from "@tauri-apps/api/dpi";
import { formatDistanceToNow } from "date-fns";

import {
  CheckMenuItem,
  Menu,
  PredefinedMenuItem,
  Submenu,
} from "@tauri-apps/api/menu";
import {
  ChevronDown,
  GitMergeConflict,
  PenBoxIcon,
  Pin,
  Search,
  X,
} from "lucide-react";
import { LayoutGroup, motion } from "framer-motion";
import {
  Fragment,
  useCallback,
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { useInView } from "react-intersection-observer";

import { Button } from "@/shared/ui/button";
import { searchWordsFromQuery } from "@/shared/lib/search";
import { useShellStore } from "@/features/shell/store/use-shell-store";

import {
  type NoteFilter,
  type NoteSortDirection,
  type NoteSortField,
  type NoteSummary,
} from "@/shared/api/types";

function notesHeading(noteFilter: NoteFilter) {
  if (noteFilter === "archive") {
    return "Archive";
  }

  if (noteFilter === "trash") {
    return "Trash";
  }

  if (noteFilter === "today") {
    return "Today";
  }

  return "All Notes";
}

type NotesPaneProps = {
  activeTags: string[];
  creatingNoteId: string | null;
  filteredNotes: NoteSummary[];
  hasMoreNotes: boolean | undefined;
  isCreatingNote: boolean;
  isLoadingMoreNotes: boolean;
  isMutatingNote: boolean;
  noteFilter: NoteFilter;
  searchQuery: string;
  selectedNoteId: string | null;
  sortField: NoteSortField;
  sortDirection: NoteSortDirection;
  totalNoteCount: number;
  onArchiveNote(noteId: string): void;
  onChangeSearch(query: string): void;
  onChangeSortField(field: NoteSortField): void;
  onChangeSortDirection(direction: NoteSortDirection): void;
  onCopyNoteContent(noteId: string): void;
  onCreateNote(source: "keyboard" | "pointer"): void;
  onDeleteNotePermanently(noteId: string): void;
  onDuplicateNote(noteId: string): void;
  onLoadMore(): void;
  onRestoreFromTrash(noteId: string): void;
  onSetNotePinned(noteId: string, pinned: boolean): void;
  onSetNoteReadonly(noteId: string, readonly: boolean): void;
  onExportNotes(): void;
  onRestoreNote(noteId: string): void;
  onTrashNote(noteId: string): void;
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

const HIGHLIGHT_CLASS_NAME =
  "bg-yellow-300 text-background rounded-[3px] px-[0.08rem] [box-decoration-break:clone] [-webkit-box-decoration-break:clone]";
const MAX_HIGHLIGHT_MATCHES_PER_BLOCK = 24;

function normalizeHighlightWords(searchWords: string[]) {
  return (
    searchWords
      .map((word) => word.toLocaleLowerCase())
      .filter(Boolean)
      // eslint-disable-next-line unicorn/no-array-sort -- app tsconfig targets ES2020, so toSorted() is unavailable here
      .sort((left, right) => right.length - left.length)
  );
}

async function showNoteSortMenu(
  event: React.MouseEvent<HTMLButtonElement>,
  ctx: {
    sortField: NoteSortField;
    sortDirection: NoteSortDirection;
    totalNoteCount: number;
    onChangeSortField: (field: NoteSortField) => void;
    onChangeSortDirection: (direction: NoteSortDirection) => void;
    onExportNotes: () => void;
  },
) {
  const rect = event.currentTarget.getBoundingClientRect();
  const isDateField = ctx.sortField !== "title";
  const newestLabel = isDateField ? "Newest First" : "A to Z";
  const oldestLabel = isDateField ? "Oldest First" : "Z to A";

  const sortSubmenu = await Submenu.new({
    text: "Sort By",
    items: [
      await CheckMenuItem.new({
        id: "sort-modified_at",
        text: "Modification Date",
        checked: ctx.sortField === "modified_at",
        action: () => ctx.onChangeSortField("modified_at"),
      }),
      await CheckMenuItem.new({
        id: "sort-created_at",
        text: "Creation Date",
        checked: ctx.sortField === "created_at",
        action: () => ctx.onChangeSortField("created_at"),
      }),
      await CheckMenuItem.new({
        id: "sort-title",
        text: "Title",
        checked: ctx.sortField === "title",
        action: () => ctx.onChangeSortField("title"),
      }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await CheckMenuItem.new({
        id: "dir-newest",
        text: newestLabel,
        checked: ctx.sortDirection === "newest",
        action: () => ctx.onChangeSortDirection("newest"),
      }),
      await CheckMenuItem.new({
        id: "dir-oldest",
        text: oldestLabel,
        checked: ctx.sortDirection === "oldest",
        action: () => ctx.onChangeSortDirection("oldest"),
      }),
    ],
  });

  const noteCountLabel = `${ctx.totalNoteCount} ${ctx.totalNoteCount === 1 ? "note" : "notes"}`;
  const menu = await Menu.new({
    items: [
      { id: "note-count", text: noteCountLabel, enabled: false },
      await PredefinedMenuItem.new({ item: "Separator" }),
      sortSubmenu,
      await PredefinedMenuItem.new({ item: "Separator" }),
      {
        id: "export-notes",
        text: "Export as Markdown\u2026",
        action: () => ctx.onExportNotes(),
      },
    ],
  });

  try {
    await menu.popup(new LogicalPosition(rect.left, rect.bottom));
  } finally {
    await menu.close();
  }
}

async function showNoteContextMenu(
  event: MouseEvent<HTMLButtonElement>,
  note: NoteSummary,
  ctx: {
    isArchive: boolean;
    isTrash: boolean;
    onSetNotePinned: (noteId: string, pinned: boolean) => void;
    onCopyNoteContent: (noteId: string) => void;
    onDeleteNotePermanently: (noteId: string) => void;
    onRestoreFromTrash: (noteId: string) => void;
    onTrashNote: (noteId: string) => void;
    onArchiveNote: (noteId: string) => void;
    onRestoreNote: (noteId: string) => void;
    onSetNoteReadonly: (noteId: string, readonly: boolean) => void;
    onDuplicateNote: (noteId: string) => void;
  },
) {
  event.preventDefault();

  const menu = await Menu.new({
    items: [
      {
        id: `${note.pinnedAt ? "unpin" : "pin"}-${note.id}`,
        text: note.pinnedAt ? "Unpin" : "Pin To Top",
        action: () => ctx.onSetNotePinned(note.id, !note.pinnedAt),
      },
      {
        id: `copy-${note.id}`,
        text: "Copy",
        action: () => ctx.onCopyNoteContent(note.id),
      },
      { item: "Separator" as const },
      ...(ctx.isTrash
        ? [
            {
              id: `delete-forever-${note.id}`,
              text: "Delete",
              action: () => ctx.onDeleteNotePermanently(note.id),
            },
            {
              id: `restore-trash-${note.id}`,
              text: "Restore",
              action: () => ctx.onRestoreFromTrash(note.id),
            },
          ]
        : [
            {
              id: `delete-${note.id}`,
              text: "Delete",
              action: () => ctx.onTrashNote(note.id),
            },
            {
              id: `restore-trash-${note.id}`,
              text: "Restore",
              enabled: false,
            },
          ]),
      { item: "Separator" as const },
      ...(ctx.isArchive
        ? [
            {
              id: `archive-${note.id}`,
              text: "Archive",
              enabled: false,
            },
            {
              id: `unarchive-${note.id}`,
              text: "Unarchive",
              action: () => ctx.onRestoreNote(note.id),
            },
          ]
        : [
            {
              id: `archive-${note.id}`,
              text: "Archive",
              enabled: !ctx.isTrash,
              action: () => ctx.onArchiveNote(note.id),
            },
            {
              id: `unarchive-${note.id}`,
              text: "Unarchive",
              enabled: false,
            },
          ]),
      { item: "Separator" as const },
      await CheckMenuItem.new({
        id: `readonly-${note.id}`,
        text: "Read-only",
        checked: note.readonly,
        action: () => ctx.onSetNoteReadonly(note.id, !note.readonly),
      }),
      {
        id: `duplicate-${note.id}`,
        text: "Duplicate",
        action: () => ctx.onDuplicateNote(note.id),
      },
    ],
  });

  try {
    await menu.popup(new LogicalPosition(event.clientX, event.clientY));
  } finally {
    await menu.close();
  }
}

function findNextHighlightMatch(
  lowerText: string,
  cursor: number,
  highlightWords: string[],
): { index: number; length: number } {
  let nextIndex = -1;
  let nextLength = 0;
  for (const word of highlightWords) {
    const index = lowerText.indexOf(word, cursor);
    if (index === -1) continue;
    if (
      nextIndex === -1 ||
      index < nextIndex ||
      (index === nextIndex && word.length > nextLength)
    ) {
      nextIndex = index;
      nextLength = word.length;
    }
  }
  return { index: nextIndex, length: nextLength };
}

const HighlightedText = memo(function HighlightedText({
  text,
  highlightWords,
}: {
  text: string;
  highlightWords: string[];
}) {
  if (highlightWords.length === 0 || text.length === 0) {
    return <>{text}</>;
  }

  const lowerText = text.toLocaleLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  let matchCount = 0;

  while (cursor < text.length) {
    const match = findNextHighlightMatch(lowerText, cursor, highlightWords);
    if (match.index === -1) break;

    if (match.index > cursor) {
      parts.push(
        <Fragment key={`text-${key++}`}>
          {text.slice(cursor, match.index)}
        </Fragment>,
      );
    }

    const end = match.index + match.length;
    parts.push(
      <mark className={HIGHLIGHT_CLASS_NAME} key={`mark-${key++}`}>
        {text.slice(match.index, end)}
      </mark>,
    );
    cursor = end;
    matchCount += 1;

    if (matchCount >= MAX_HIGHLIGHT_MATCHES_PER_BLOCK) break;
  }

  if (parts.length === 0) return <>{text}</>;
  if (cursor < text.length) {
    parts.push(<Fragment key={`text-${key++}`}>{text.slice(cursor)}</Fragment>);
  }
  return <>{parts}</>;
});

type NoteRowProps = {
  focusedPane: "sidebar" | "notes" | "editor";
  highlightWords: string[];
  isJustCreated: boolean;
  isMutatingNote: boolean;
  isNextActive: boolean;
  isSearchFocused: boolean;
  note: NoteSummary;
  onContextMenu(event: MouseEvent<HTMLButtonElement>, note: NoteSummary): void;
  onSelectNote(noteId: string): void;
  searchWords: string[];
  selectedNoteId: string | null;
  setSlideInNoteId(noteId: string | null): void;
  shouldSkipAnimation: boolean;
};

function noteCardPreview(note: NoteSummary, searchWords: string[]) {
  const fallback = note.title ? "" : "No content yet";
  if (searchWords.length > 0) {
    return note.searchSnippet || note.preview || fallback;
  }
  return note.preview || fallback;
}

function noteRowClassName(params: {
  focusedPane: "sidebar" | "notes" | "editor";
  isActive: boolean;
  isSearchFocused: boolean;
}) {
  const { focusedPane, isActive, isSearchFocused } = params;
  return [
    "relative flex h-[6.75rem] w-full cursor-default flex-col items-start gap-2 overflow-hidden rounded-md px-3 py-2.5 text-left text-sm",
    isActive ? "bg-accent/50" : "",
    isActive && focusedPane === "notes" && !isSearchFocused
      ? "before:bg-primary/60 before:absolute before:inset-y-0 before:left-0 before:w-[5px]"
      : "",
  ].join(" ");
}

const NoteRow = memo(function NoteRow({
  focusedPane,
  highlightWords,
  isJustCreated,
  isMutatingNote,
  isNextActive,
  isSearchFocused,
  note,
  onContextMenu,
  onSelectNote,
  searchWords,
  selectedNoteId,
  setSlideInNoteId,
  shouldSkipAnimation,
}: NoteRowProps) {
  const isActive = note.id === selectedNoteId;
  const cardPreview = noteCardPreview(note, searchWords);

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
        onClick={() => onSelectNote(note.id)}
        onContextMenu={(event) => onContextMenu(event, note)}
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
});

export function NotesPane({
  activeTags,
  creatingNoteId,
  filteredNotes,
  hasMoreNotes,
  isCreatingNote,
  isLoadingMoreNotes,
  isMutatingNote,
  noteFilter,
  searchQuery,
  selectedNoteId,
  sortField,
  sortDirection,
  onArchiveNote,
  onChangeSearch,
  onChangeSortField,
  onChangeSortDirection,
  onCopyNoteContent,
  onCreateNote,
  onDeleteNotePermanently,
  onDuplicateNote,
  onExportNotes,
  onLoadMore,
  onRestoreFromTrash,
  onSetNotePinned,
  onSetNoteReadonly,
  onRestoreNote,
  onSelectNote,
  onTrashNote,
  totalNoteCount,
}: NotesPaneProps) {
  const focusedPane = useShellStore((s) => s.focusedPane);
  const isArchive = noteFilter === "archive";
  const isTrash = noteFilter === "trash";
  const [isSearchOpen, setIsSearchOpen] = useState(
    () => searchQuery.length > 0,
  );
  const [showHeaderBorder, setShowHeaderBorder] = useState(false);
  const [slideInNoteId, setSlideInNoteId] = useState<string | null>(null);

  // When creatingNoteId changes to a new value, mark it for slide-in
  useEffect(() => {
    if (creatingNoteId) {
      setSlideInNoteId(creatingNoteId);
    }
  }, [creatingNoteId]);

  const viewKey = `${noteFilter}-${activeTags.join(",")}-${searchQuery}`;
  const prevViewKeyRef = useRef(viewKey);
  const skipAnimationUntilRef = useRef(0);

  // When the view changes, suppress animations until the data settles.
  // We use a timestamp so that any renders within the window get duration: 0.
  if (prevViewKeyRef.current !== viewKey) {
    prevViewKeyRef.current = viewKey;
    skipAnimationUntilRef.current = Date.now() + 500;
  }

  const shouldSkipAnimation = Date.now() < skipAnimationUntilRef.current;
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const { ref: loadMoreRef, inView } = useInView({
    rootMargin: "160px 0px",
  });
  const searchWords = useMemo(
    () => searchWordsFromQuery(searchQuery),
    [searchQuery],
  );
  const highlightWords = useMemo(
    () => normalizeHighlightWords(searchWords),
    [searchWords],
  );

  const applySearchQuery = useCallback(
    (nextQuery: string) => {
      onChangeSearch(nextQuery);
    },
    [onChangeSearch],
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
    const handleFocusSearch = () => {
      setIsSearchOpen(true);
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    window.addEventListener("comet:focus-search", handleFocusSearch);
    return () =>
      window.removeEventListener("comet:focus-search", handleFocusSearch);
  }, []);

  useEffect(() => {
    setShowHeaderBorder((scrollContainerRef.current?.scrollTop ?? 0) > 0);
  }, [filteredNotes.length, noteFilter, searchQuery]);

  useEffect(() => {
    if (!inView || !hasMoreNotes) {
      return;
    }

    onLoadMore();
  }, [hasMoreNotes, inView, onLoadMore]);

  const handleNoteContextMenu = (
    event: MouseEvent<HTMLButtonElement>,
    note: NoteSummary,
  ) => {
    showNoteContextMenu(event, note, {
      isArchive,
      isTrash,
      onSetNotePinned,
      onCopyNoteContent,
      onDeleteNotePermanently,
      onRestoreFromTrash,
      onTrashNote,
      onArchiveNote,
      onRestoreNote,
      onSetNoteReadonly,
      onDuplicateNote,
    }).catch(() => {});
  };

  return (
    <section className="bg-background flex h-full min-h-0 flex-col">
      <header
        className={[
          "h-13 w-full shrink-0 px-3",
          showHeaderBorder ? "border-divider border-b" : "",
        ].join(" ")}
      >
        <div className="flex h-full items-center justify-between">
          {isSearchOpen ? (
            <label className="relative z-40 w-full">
              <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <input
                className="border-input/60 placeholder:text-muted-foreground focus:border-primary h-8 w-full rounded-md border bg-transparent py-1 pr-8 pl-9 text-sm outline-none"
                onBlur={() => setIsSearchFocused(false)}
                onChange={(event) => onChangeSearch(event.currentTarget.value)}
                onFocus={() => setIsSearchFocused(true)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    if (searchQuery) {
                      applySearchQuery("");
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
                  applySearchQuery("");
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
                  onClick={(event) => {
                    showNoteSortMenu(event, {
                      sortField,
                      sortDirection,
                      totalNoteCount,
                      onChangeSortField,
                      onChangeSortDirection,
                      onExportNotes,
                    }).catch(() => {});
                  }}
                  type="button"
                >
                  <h2 className="min-w-0 truncate font-medium">
                    {notesHeading(noteFilter)}
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
                  disabled={isCreatingNote || isArchive || isTrash}
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
          <>
            <div className="space-y-0 px-3">
              <LayoutGroup key={viewKey}>
                {filteredNotes.map((note, index) => {
                  const isNextActive =
                    filteredNotes[index + 1]?.id === selectedNoteId;
                  const isJustCreated = note.id === slideInNoteId;

                  return (
                    <NoteRow
                      focusedPane={focusedPane}
                      highlightWords={highlightWords}
                      isJustCreated={isJustCreated}
                      isMutatingNote={isMutatingNote}
                      isNextActive={isNextActive}
                      isSearchFocused={isSearchFocused}
                      key={note.id}
                      note={note}
                      onContextMenu={handleNoteContextMenu}
                      onSelectNote={onSelectNote}
                      searchWords={searchWords}
                      selectedNoteId={selectedNoteId}
                      setSlideInNoteId={setSlideInNoteId}
                      shouldSkipAnimation={shouldSkipAnimation}
                    />
                  );
                })}
              </LayoutGroup>
            </div>
            {hasMoreNotes ? (
              <div className="px-[0.30rem] py-4" ref={loadMoreRef}>
                <div className="text-muted-foreground text-center text-xs">
                  {isLoadingMoreNotes ? "Loading more notes…" : ""}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
