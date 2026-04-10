import { ChevronDown, Hash, PenBoxIcon, Search, X } from "lucide-react";
import { LayoutGroup } from "framer-motion";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { useInView } from "react-intersection-observer";

import { Button } from "@/shared/ui/button";
import { searchWordsFromQuery } from "@/shared/lib/search";
import {
  type NoteListNavigationDirection,
  getAdjacentNoteId,
} from "@/features/notes-pane/lib/note-list-navigation";
import { useSidebarVisible } from "@/features/settings/store/use-ui-store";
import {
  useFocusedPane,
  useShellActions,
} from "@/features/shell/store/use-shell-store";
import {
  type FocusNotesPaneDetail,
  FOCUS_NOTES_PANE_EVENT,
} from "@/shared/lib/pane-navigation";
import {
  type NoteFilter,
  type NoteSortDirection,
  type NoteSortField,
  type NoteSummary,
} from "@/shared/api/types";

import {
  focusNotesPaneTarget,
  focusSelectedNoteRow,
  isEditableKeyboardTarget,
  normalizeHighlightWords,
  notesHeading,
  showNoteContextMenu,
  showNoteSortMenu,
} from "@/features/notes-pane/ui/notes-pane-utils";
import { NoteRow } from "@/features/notes-pane/ui/note-row";

type NotesPaneProps = {
  activeTagPath: string | null;
  creatingNoteId: string | null;
  filteredNotes: NoteSummary[];
  hasMoreNotes: boolean | undefined;
  isCreatingNote: boolean;
  isLoadingMoreNotes: boolean;
  isMutatingNote: boolean;
  isNotesPlaceholderData: boolean;
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
  onCreateNote(): void;
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

export function NotesPane({
  activeTagPath,
  creatingNoteId,
  filteredNotes,
  hasMoreNotes,
  isCreatingNote,
  isLoadingMoreNotes,
  isMutatingNote,
  isNotesPlaceholderData,
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
  const focusedPane = useFocusedPane();
  const { setFocusedPane } = useShellActions();
  const sidebarVisible = useSidebarVisible();
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

  const viewKey = `${noteFilter}-${activeTagPath ?? ""}-${searchQuery}`;
  const prevViewKeyRef = useRef(viewKey);
  const skipAnimationUntilRef = useRef(0);

  // When the view changes, suppress animations until the data settles.
  if (prevViewKeyRef.current !== viewKey) {
    prevViewKeyRef.current = viewKey;
    skipAnimationUntilRef.current = Date.now() + 500;
  }

  // Suppress layout animations when panel visibility changes.
  const prevSidebarVisibleRef = useRef(sidebarVisible);
  if (prevSidebarVisibleRef.current !== sidebarVisible) {
    prevSidebarVisibleRef.current = sidebarVisible;
    skipAnimationUntilRef.current = Date.now() + 500;
  }

  const shouldSkipAnimation = Date.now() < skipAnimationUntilRef.current;
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const pendingNotesPaneSelectionRef = useRef<
    FocusNotesPaneDetail["selection"] | null
  >(null);
  const noteRowRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const shouldRestoreSelectedRowFocusRef = useRef(false);
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
  const heading = useMemo(
    () => notesHeading(noteFilter, activeTagPath),
    [activeTagPath, noteFilter],
  );

  const applySearchQuery = useCallback(
    (nextQuery: string) => {
      onChangeSearch(nextQuery);
    },
    [onChangeSearch],
  );

  const focusSearchInput = useCallback(() => {
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, []);

  const closeSearchAndRestoreFocus = useCallback(
    (options?: { clearQuery?: boolean }) => {
      if (options?.clearQuery && searchQuery) {
        applySearchQuery("");
      }

      setIsSearchOpen(false);
      setIsSearchFocused(false);

      if (selectedNoteId) {
        setFocusedPane("notes");
        focusSelectedNoteRow(scrollContainerRef.current);
        return;
      }

      setFocusedPane("sidebar");
    },
    [applySearchQuery, searchQuery, selectedNoteId, setFocusedPane],
  );

  const handleMoveSelection = useCallback(
    (currentNoteId: string, direction: NoteListNavigationDirection) => {
      if (isMutatingNote) {
        return;
      }

      const nextNoteId = getAdjacentNoteId(
        filteredNotes,
        currentNoteId,
        direction,
      );
      if (!nextNoteId) {
        return;
      }

      noteRowRefs.current.get(nextNoteId)?.scrollIntoView({ block: "nearest" });
      setIsSearchFocused(false);
      onSelectNote(nextNoteId);
    },
    [filteredNotes, isMutatingNote, onSelectNote],
  );

  const selectFirstVisibleNote = useCallback(() => {
    const firstNoteId = filteredNotes[0]?.id;
    if (!firstNoteId) {
      return false;
    }

    onSelectNote(firstNoteId);
    return true;
  }, [filteredNotes, onSelectNote]);

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
      setFocusedPane("notes");
      setIsSearchOpen(true);
      focusSearchInput();
    };
    window.addEventListener("comet:focus-search", handleFocusSearch);
    return () =>
      window.removeEventListener("comet:focus-search", handleFocusSearch);
  }, [focusSearchInput, setFocusedPane]);

  useEffect(() => {
    const handleFocusNotesPane = (event: Event) => {
      const customEvent = event as CustomEvent<FocusNotesPaneDetail>;
      let selection = customEvent.detail?.selection ?? "selected";

      // If the selected note isn't in the current filtered list, fall back
      // to selecting the first visible note instead of focusing an empty
      // scroll container.
      if (
        selection === "selected" &&
        selectedNoteId &&
        !filteredNotes.some((n) => n.id === selectedNoteId)
      ) {
        selection = "first";
      }

      if (selection === "first") {
        if (isNotesPlaceholderData) {
          pendingNotesPaneSelectionRef.current = "first";
          return;
        }

        setIsSearchFocused(false);
        setFocusedPane("notes");
        selectFirstVisibleNote();
        focusNotesPaneTarget(scrollContainerRef.current);
        return;
      }

      pendingNotesPaneSelectionRef.current = "selected";
      setFocusedPane("notes");
      setIsSearchFocused(false);
      focusNotesPaneTarget(scrollContainerRef.current);
    };

    window.addEventListener(FOCUS_NOTES_PANE_EVENT, handleFocusNotesPane);
    return () => {
      window.removeEventListener(FOCUS_NOTES_PANE_EVENT, handleFocusNotesPane);
    };
  }, [
    filteredNotes,
    isNotesPlaceholderData,
    selectFirstVisibleNote,
    selectedNoteId,
    setFocusedPane,
  ]);

  useEffect(() => {
    setShowHeaderBorder((scrollContainerRef.current?.scrollTop ?? 0) > 0);
  }, [activeTagPath, filteredNotes.length, noteFilter, searchQuery]);

  useEffect(() => {
    if (isSearchFocused || focusedPane !== "notes") {
      return;
    }

    if (pendingNotesPaneSelectionRef.current && isNotesPlaceholderData) {
      return;
    }

    if (selectedNoteId || shouldRestoreSelectedRowFocusRef.current) {
      pendingNotesPaneSelectionRef.current = null;
      shouldRestoreSelectedRowFocusRef.current = false;
      focusSelectedNoteRow(scrollContainerRef.current);
      return;
    }

    if (pendingNotesPaneSelectionRef.current && selectFirstVisibleNote()) {
      pendingNotesPaneSelectionRef.current = null;
      return;
    }

    pendingNotesPaneSelectionRef.current = null;
    focusNotesPaneTarget(scrollContainerRef.current);
  }, [
    filteredNotes.length,
    focusedPane,
    isNotesPlaceholderData,
    isSearchFocused,
    selectFirstVisibleNote,
    selectedNoteId,
  ]);

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
    <section
      className="bg-background flex h-full min-h-0 flex-col"
      onKeyDown={(event) => {
        if (
          event.defaultPrevented ||
          focusedPane !== "notes" ||
          isEditableKeyboardTarget(event.target) ||
          event.metaKey ||
          event.ctrlKey ||
          event.altKey ||
          event.shiftKey ||
          event.key !== "/"
        ) {
          return;
        }

        event.preventDefault();
        setIsSearchOpen(true);
        focusSearchInput();
      }}
    >
      <header
        className={[
          "h-13 w-full shrink-0 px-3",
          sidebarVisible ? "" : "pl-20",
          showHeaderBorder ? "border-separator border-b" : "",
        ].join(" ")}
      >
        <div className="flex h-full items-center justify-between">
          {isSearchOpen ? (
            <label className="relative z-40 w-full">
              <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <input
                autoCapitalize="off"
                className="border-input/60 placeholder:text-muted-foreground focus:border-primary h-8 w-full rounded-md border bg-transparent py-1 pr-8 pl-9 text-sm outline-none"
                onBlur={() => setIsSearchFocused(false)}
                onChange={(event) => onChangeSearch(event.currentTarget.value)}
                onFocus={() => setIsSearchFocused(true)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    closeSearchAndRestoreFocus({ clearQuery: true });
                  }
                }}
                placeholder="Search…"
                ref={searchInputRef}
                value={searchQuery}
              />
              <Button
                className="text-muted-foreground hover:bg-accent hover:text-accent-foreground absolute top-1/2 right-1 z-10 -translate-y-1/2"
                onClick={() => {
                  closeSearchAndRestoreFocus({ clearQuery: true });
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
                  <h2 className="flex min-w-0 items-center gap-1 truncate font-medium">
                    {heading.showTagIcon ? (
                      <Hash className="text-sidebar-tag-icon size-3.5 shrink-0" />
                    ) : null}
                    <span className="min-w-0 truncate">{heading.label}</span>
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
                  onClick={onCreateNote}
                  onMouseDown={(event) => event.preventDefault()}
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
        tabIndex={-1}
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
                      onMoveSelection={(direction) => {
                        handleMoveSelection(note.id, direction);
                      }}
                      onRowRef={(noteId, element) => {
                        if (element) {
                          noteRowRefs.current.set(noteId, element);
                        } else {
                          noteRowRefs.current.delete(noteId);
                        }
                      }}
                      onSelectNote={(noteId) => {
                        setIsSearchFocused(false);
                        onSelectNote(noteId);
                      }}
                      searchWords={searchWords}
                      selectedNoteId={selectedNoteId}
                      setSlideInNoteId={setSlideInNoteId}
                      shouldSkipAnimation={shouldSkipAnimation}
                      setShouldRestoreSelectedRowFocus={() => {
                        shouldRestoreSelectedRowFocusRef.current = true;
                      }}
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
