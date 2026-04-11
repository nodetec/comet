import { useRef, useEffect } from "react";
import { Loader2, Inbox } from "lucide-react";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";
import type { Note } from "~/lib/nostr/snapshot";

function formatRelativeDate(millis: number): string {
  const now = Date.now();
  const diff = now - millis;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 30) {
    return new Date(millis).toLocaleDateString();
  }
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

function getSnippet(markdown: string, maxLen = 120): string {
  const lines = markdown.split("\n");
  const contentLines = lines.filter((l) => !l.startsWith("# ") && l.trim());
  const text = contentLines.join(" ").slice(0, maxLen);
  return text.length >= maxLen ? `${text}...` : text;
}

function NoteListItem({
  note,
  isSelected,
  onSelect,
}: {
  note: Note;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const hasTitle = !!note.title;
  return (
    <button
      onClick={onSelect}
      className={cn(
        "relative flex h-[6.75rem] w-full cursor-default flex-col items-start gap-1.5 overflow-hidden rounded-md px-3 py-2.5 text-left text-sm transition-colors",
        isSelected ? "bg-accent/50" : "hover:bg-accent/30",
      )}
    >
      <h3
        className={cn(
          "max-w-full min-w-0 truncate font-semibold",
          hasTitle ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {note.title || "Untitled"}
      </h3>
      <p
        className={cn(
          "text-muted-foreground max-w-full min-w-0 overflow-hidden text-sm break-words",
          hasTitle ? "line-clamp-2" : "line-clamp-3",
        )}
      >
        {getSnippet(note.markdown, 160)}
      </p>
      <div className="mt-auto flex w-full min-w-0 items-center gap-2">
        <span className="text-muted-foreground/70 min-w-0 truncate text-xs">
          {formatRelativeDate(note.modifiedAt)}
        </span>
        {note.tags.length > 0 && (
          <span className="text-primary ml-auto min-w-0 truncate text-xs">
            {note.tags
              .slice(0, 2)
              .map((t) => `#${t}`)
              .join(" ")}
          </span>
        )}
      </div>
    </button>
  );
}

function NoteListSeparator({ hidden }: { hidden?: boolean }) {
  return (
    <div
      className={cn("h-px w-full", hidden ? "bg-transparent" : "bg-accent/35")}
    />
  );
}

const SKELETON_KEYS = ["s1", "s2", "s3", "s4", "s5", "s6"];

function NoteListSkeleton() {
  return (
    <div className="space-y-0 px-3">
      {SKELETON_KEYS.map((id) => (
        <div key={id}>
          <div className="flex h-[6.75rem] flex-col gap-1.5 px-3 py-2.5">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-2/3" />
            <div className="mt-auto flex justify-between">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-12" />
            </div>
          </div>
          <div className="bg-accent/35 h-px w-full" />
        </div>
      ))}
    </div>
  );
}

export function NoteList({
  notes,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
  selectedNoteId,
  onSelectNote,
}: {
  notes: Note[];
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  selectedNoteId: string | null;
  onSelectNote: (id: string) => void;
}) {
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Infinite scroll observer
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="bg-muted/30 border-border flex min-h-0 w-80 shrink-0 flex-col border-r">
      <div className="px-4 py-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight">Notes</h2>
          {!isLoading && notes.length > 0 && (
            <span className="text-muted-foreground text-xs tabular-nums">
              {notes.length}
            </span>
          )}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1 overflow-hidden">
        {/* oxlint-disable unicorn/no-nested-ternary -- loading/empty/content pattern */}
        {isLoading && notes.length === 0 ? (
          <NoteListSkeleton />
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
            <div className="bg-muted mb-3 flex h-10 w-10 items-center justify-center rounded-full">
              <Inbox className="text-muted-foreground h-5 w-5" />
            </div>
            <p className="text-sm font-medium">No notes yet</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Notes you publish from Comet will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-0 px-3">
            {notes.map((note, i) => (
              <div key={note.id}>
                {i > 0 && (
                  <NoteListSeparator
                    hidden={
                      note.id === selectedNoteId ||
                      notes[i - 1]?.id === selectedNoteId
                    }
                  />
                )}
                <NoteListItem
                  note={note}
                  isSelected={note.id === selectedNoteId}
                  onSelect={() => onSelectNote(note.id)}
                />
              </div>
            ))}
            <div ref={loadMoreRef} className="h-4" />
            {isFetchingNextPage && (
              <div className="flex justify-center py-3">
                <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
              </div>
            )}
          </div>
        )}
        {/* oxlint-enable unicorn/no-nested-ternary */}
      </ScrollArea>
    </div>
  );
}
