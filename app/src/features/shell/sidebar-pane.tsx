import { useEffect, useRef, useState, type MouseEvent } from "react";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Menu } from "@tauri-apps/api/menu";
import {
  Archive,
  CalendarDays,
  CheckSquare,
  Square,
  ChevronRight,
  CloudAlert,
  CloudOff,
  CloudSync,
  CloudCheck,
  FileTextIcon,
  Settings2,
  Trash2,
} from "lucide-react";

import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import { SyncDialog } from "@/features/sync";
import { useUIStore } from "@/features/settings/store/use-ui-store";
import { type NoteFilter } from "@/shared/api/types";
import { useShellStore } from "@/features/shell/store/use-shell-store";

function sidebarItemClasses(isActive: boolean, isFocused?: boolean) {
  let stateClass: string;
  if (isActive && isFocused) {
    stateClass =
      "bg-primary/50 text-primary-foreground [&_svg]:text-primary-foreground";
  } else if (isActive) {
    stateClass = "bg-accent/80 text-secondary-foreground";
  } else {
    stateClass = "text-secondary-foreground";
  }
  return `flex w-full cursor-default items-center gap-3 rounded-md px-3 py-1.5 text-left text-sm transition-colors ${stateClass}`;
}

type SidebarPaneProps = {
  activeTags: string[];
  archivedCount: number;
  todoCount: number;
  trashedCount: number;
  availableTags: string[];
  noteFilter: NoteFilter;
  onSelectAll(): void;
  onSelectToday(): void;
  onSelectTodo(): void;
  onSelectArchive(): void;
  onSelectTrash(): void;
  onEmptyTrash(): void;
  onToggleTag(tag: string): void;
};

async function showTrashContextMenu(
  event: MouseEvent<HTMLButtonElement>,
  onEmptyTrash: () => void,
) {
  event.preventDefault();
  const menu = await Menu.new({
    items: [
      { id: "empty-trash", text: "Empty Trash", action: () => onEmptyTrash() },
    ],
  });
  try {
    await menu.popup(new LogicalPosition(event.clientX, event.clientY));
  } finally {
    await menu.close();
  }
}

function useSyncState() {
  const [syncState, setSyncState] = useState<string>("disconnected");

  useEffect(() => {
    invoke<string | { error: { message: string } }>("get_sync_status")
      .then((s) => {
        setSyncState(typeof s === "string" ? s : "error");
      })
      .catch(() => {});
    const unlisten = listen<{ state: string | { error: { message: string } } }>(
      "sync-status",
      (event) => {
        const s = event.payload.state;
        setSyncState(typeof s === "string" ? s : "error");
      },
    );
    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, []);

  return syncState;
}

export function SidebarPane({
  activeTags,
  archivedCount,
  todoCount,
  trashedCount,
  availableTags,
  noteFilter,
  onSelectAll,
  onSelectToday,
  onSelectTodo,
  onSelectArchive,
  onSelectTrash,
  onEmptyTrash,
  onToggleTag,
}: SidebarPaneProps) {
  const isFocused = useShellStore((s) => s.focusedPane === "sidebar");
  const openSettings = useUIStore((s) => s.setSettingsOpen);
  const syncState = useSyncState();

  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [showHeaderBorder, setShowHeaderBorder] = useState(false);
  const [showFooterBorder, setShowFooterBorder] = useState(false);
  const [notesOpen, setNotesOpen] = useState(true);
  const [tagsOpen, setTagsOpen] = useState(true);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const footerSentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    setShowHeaderBorder((scrollContainer?.scrollTop ?? 0) > 0);
  }, [availableTags.length, noteFilter]);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    const footerSentinel = footerSentinelRef.current;
    if (!scrollContainer || !footerSentinel) {
      setShowFooterBorder(false);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowFooterBorder(!entry?.isIntersecting);
      },
      {
        root: scrollContainer,
        threshold: 1,
      },
    );

    observer.observe(footerSentinel);

    return () => {
      observer.disconnect();
    };
  }, [availableTags.length, noteFilter]);

  const handleTrashContextMenu = (event: MouseEvent<HTMLButtonElement>) => {
    showTrashContextMenu(event, onEmptyTrash).catch(() => {});
  };

  return (
    <aside className="bg-sidebar flex h-full min-h-0 flex-col">
      <header
        className={cn(
          "flex h-13 shrink-0 items-center justify-end px-3",
          showHeaderBorder && "border-divider border-b",
        )}
      >
        <div className="relative z-40 flex gap-1">
          <Button
            aria-label={`Sync: ${syncState}`}
            className="text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            size="icon-sm"
            variant="ghost"
            onClick={() => setSyncDialogOpen(true)}
          >
            {syncState === "connected" && (
              <CloudCheck className="size-[1.2rem]" />
            )}
            {syncState === "needsUnlock" && (
              <CloudAlert className="size-[1.2rem] text-amber-500" />
            )}
            {(syncState === "syncing" ||
              syncState === "connecting" ||
              syncState === "authenticating") && (
              <CloudSync className="size-[1.2rem] animate-pulse" />
            )}
            {syncState === "error" && (
              <CloudAlert className="text-destructive size-[1.2rem]" />
            )}
            {syncState === "disconnected" && (
              <CloudOff className="size-[1.2rem]" />
            )}
          </Button>
          <SyncDialog open={syncDialogOpen} onOpenChange={setSyncDialogOpen} />
          <Button
            aria-label="Settings"
            className="text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={() => openSettings(true)}
            size="icon-sm"
            variant="ghost"
          >
            <Settings2 className="size-[1.2rem]" />
          </Button>
        </div>
      </header>
      <nav
        className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto px-2 pt-3"
        onScroll={(event) => {
          setShowHeaderBorder(event.currentTarget.scrollTop > 0);
        }}
        ref={scrollContainerRef}
      >
        <section>
          <button
            className="text-sidebar-foreground/70 group flex h-4 w-full items-center justify-between pl-1 text-left text-xs"
            onClick={() => {
              setNotesOpen((current) => !current);
            }}
            type="button"
          >
            <span className="leading-none">Notes</span>
            <ChevronRight
              className={cn(
                "size-3 shrink-0 self-center opacity-0 transition-all duration-200 group-hover:opacity-100",
                notesOpen ? "rotate-90" : "rotate-0",
              )}
            />
          </button>
          <div
            className={cn(
              "grid overflow-hidden transition-all duration-200 ease-out",
              notesOpen
                ? "grid-rows-[1fr] pt-1 opacity-100"
                : "grid-rows-[0fr] opacity-0",
            )}
          >
            <div className="min-h-0">
              <button
                className={sidebarItemClasses(noteFilter === "all", isFocused)}
                onClick={onSelectAll}
                type="button"
              >
                <FileTextIcon className="text-primary size-4 shrink-0" />
                All Notes
              </button>
              <button
                className={sidebarItemClasses(
                  noteFilter === "today",
                  isFocused,
                )}
                onClick={onSelectToday}
                type="button"
              >
                <CalendarDays className="text-primary size-4 shrink-0" />
                Today
              </button>
              <button
                className={sidebarItemClasses(noteFilter === "todo", isFocused)}
                onClick={onSelectTodo}
                type="button"
              >
                {todoCount > 0 ? (
                  <Square className="text-primary size-4 shrink-0" />
                ) : (
                  <CheckSquare className="text-primary size-4 shrink-0" />
                )}
                Todo
              </button>
              {(archivedCount > 0 || noteFilter === "archive") && (
                <button
                  className={sidebarItemClasses(
                    noteFilter === "archive",
                    isFocused,
                  )}
                  onClick={onSelectArchive}
                  type="button"
                >
                  <Archive className="text-primary size-4 shrink-0" />
                  Archive
                </button>
              )}
              {(trashedCount > 0 || noteFilter === "trash") && (
                <button
                  className={sidebarItemClasses(
                    noteFilter === "trash",
                    isFocused,
                  )}
                  onClick={onSelectTrash}
                  onContextMenu={(event) => handleTrashContextMenu(event)}
                  type="button"
                >
                  <Trash2 className="text-primary size-4 shrink-0" />
                  Trash
                </button>
              )}
            </div>
          </div>
        </section>

        {availableTags.length > 0 ? (
          <section>
            <button
              className="text-sidebar-foreground/70 group flex h-4 w-full items-center justify-between pl-1 text-left text-xs"
              onClick={() => {
                setTagsOpen((current) => !current);
              }}
              type="button"
            >
              <span className="leading-none">Tags</span>
              <ChevronRight
                className={cn(
                  "size-3 shrink-0 self-center opacity-0 transition-all duration-200 group-hover:opacity-100",
                  tagsOpen ? "rotate-90" : "rotate-0",
                )}
              />
            </button>
            <div
              className={cn(
                "grid overflow-hidden transition-all duration-200 ease-out",
                tagsOpen
                  ? "grid-rows-[1fr] pt-2 opacity-100"
                  : "grid-rows-[0fr] opacity-0",
              )}
            >
              <div className="min-h-0">
                <div className="flex flex-wrap gap-2 pl-1">
                  {availableTags.map((tag) => {
                    const isActive = activeTags.includes(tag);

                    return (
                      <button
                        className={cn(
                          "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                          isActive
                            ? "bg-primary/25 text-secondary-foreground"
                            : "bg-accent text-secondary-foreground hover:bg-accent/80",
                        )}
                        key={tag}
                        onClick={() => onToggleTag(tag)}
                        type="button"
                      >
                        #{tag}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        ) : null}
        <div className="h-px shrink-0" ref={footerSentinelRef} />
      </nav>

      {showFooterBorder ? <div className="border-divider border-t" /> : null}
    </aside>
  );
}
