import { useEffect, useRef, useState, type MouseEvent } from "react";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Menu } from "@tauri-apps/api/menu";
import {
  Archive,
  BookText,
  CalendarDays,
  ChevronRight,
  CloudAlert,
  CloudOff,
  CloudSync,
  CloudCheck,
  FileTextIcon,
  PlusCircleIcon,
  Settings2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useUIStore } from "@/stores/use-ui-store";
import { type NoteFilter } from "@/stores/use-shell-store";

import { type NotebookSummary, sidebarItemClasses } from "./types";

type SidebarPaneProps = {
  activeNotebookId: string | null;
  activeTags: string[];
  editingNotebookId: string | null;
  availableTags: string[];
  isCreatingNotebook: boolean;
  newNotebookName: string;
  noteFilter: NoteFilter;
  notebooks: NotebookSummary[];
  onChangeNotebookName(name: string): void;
  onChangeRenamingNotebookName(name: string): void;
  onCreateNotebook(): void;
  onShowCreateNotebook(): void;
  onHideCreateNotebook(): void;
  onHideRenameNotebook(): void;
  onDeleteNotebook(notebookId: string): void;
  onSelectAll(): void;
  onSelectToday(): void;
  onSelectNotebook(notebookId: string): void;
  onSelectArchive(): void;
  onToggleTag(tag: string): void;
  onShowRenameNotebook(notebookId: string): void;
  onSubmitRenameNotebook(): void;
  renameNotebookDisabled: boolean;
  renamingNotebookName: string;
};

export function SidebarPane({
  activeNotebookId,
  activeTags,
  availableTags,
  editingNotebookId,
  isCreatingNotebook,
  newNotebookName,
  noteFilter,
  notebooks,
  onChangeNotebookName,
  onChangeRenamingNotebookName,
  onCreateNotebook,
  onHideCreateNotebook,
  onHideRenameNotebook,
  onDeleteNotebook,
  onSelectAll,
  onSelectToday,
  onSelectNotebook,
  onSelectArchive,
  onToggleTag,
  onShowRenameNotebook,
  onShowCreateNotebook,
  onSubmitRenameNotebook,
  renameNotebookDisabled,
  renamingNotebookName,
}: SidebarPaneProps) {
  const openSettings = useUIStore((s) => s.setSettingsOpen);
  const [syncState, setSyncState] = useState<string>("disconnected");

  useEffect(() => {
    invoke<string | { error: { message: string } }>("get_sync_status").then((s) => {
      setSyncState(typeof s === "string" ? s : "error");
    });
    const unlisten = listen<{ state: string | { error: { message: string } } }>(
      "sync-status",
      (event) => {
        const s = event.payload.state;
        setSyncState(typeof s === "string" ? s : "error");
      },
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const [showHeaderBorder, setShowHeaderBorder] = useState(false);
  const [showFooterBorder, setShowFooterBorder] = useState(false);
  const [notesOpen, setNotesOpen] = useState(true);
  const [notebooksOpen, setNotebooksOpen] = useState(true);
  const [tagsOpen, setTagsOpen] = useState(true);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const footerSentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    setShowHeaderBorder((scrollContainer?.scrollTop ?? 0) > 0);
  }, [
    availableTags.length,
    editingNotebookId,
    isCreatingNotebook,
    noteFilter,
    notebooks.length,
  ]);

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
  }, [
    availableTags.length,
    editingNotebookId,
    isCreatingNotebook,
    noteFilter,
    notebooks.length,
  ]);

  const handleNotebookContextMenu = async (
    event: MouseEvent<HTMLButtonElement>,
    notebookId: string,
  ) => {
    event.preventDefault();

    const menu = await Menu.new({
      items: [
        {
          id: `rename-notebook-${notebookId}`,
          text: "Rename",
          action: () => {
            onShowRenameNotebook(notebookId);
          },
        },
        {
          id: `delete-notebook-${notebookId}`,
          text: "Delete Notebook",
          action: () => {
            onDeleteNotebook(notebookId);
          },
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
    <aside className="bg-sidebar flex h-full min-h-0 flex-col">
      <header
        className={[
          "flex h-13 shrink-0 items-center justify-end px-3",
          showHeaderBorder ? "border-b" : "",
        ].join(" ")}
      >
        <div className="relative z-40 flex gap-1">
          <Button
            aria-label={`Sync: ${syncState}`}
            className="text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            size="icon-sm"
            variant="ghost"
            onClick={() => {
              openSettings(true);
            }}
          >
            {syncState === "connected" && (
              <CloudCheck className="size-[1.2rem] text-emerald-500" />
            )}
            {(syncState === "syncing" || syncState === "connecting" || syncState === "authenticating") && (
              <CloudSync className="size-[1.2rem] animate-spin" />
            )}
            {syncState === "error" && (
              <CloudAlert className="size-[1.2rem] text-destructive" />
            )}
            {syncState === "disconnected" && (
              <CloudOff className="size-[1.2rem]" />
            )}
          </Button>
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
              className={[
                "size-3 shrink-0 self-center opacity-0 transition-all duration-200 group-hover:opacity-100",
                notesOpen ? "rotate-90" : "rotate-0",
              ].join(" ")}
            />
          </button>
          <div
            className={[
              "grid overflow-hidden transition-all duration-200 ease-out",
              notesOpen
                ? "grid-rows-[1fr] pt-1 opacity-100"
                : "grid-rows-[0fr] opacity-0",
            ].join(" ")}
          >
            <div className="min-h-0">
              <button
                className={sidebarItemClasses(noteFilter === "all")}
                onClick={onSelectAll}
                type="button"
              >
                <FileTextIcon className="text-primary size-4 shrink-0" />
                All Notes
              </button>
              <button
                className={sidebarItemClasses(noteFilter === "today")}
                onClick={onSelectToday}
                type="button"
              >
                <CalendarDays className="text-primary size-4 shrink-0" />
                Today
              </button>
              <button
                className={sidebarItemClasses(noteFilter === "archive")}
                onClick={onSelectArchive}
                type="button"
              >
                <Archive className="text-primary size-4 shrink-0" />
                Archive
              </button>
            </div>
          </div>
        </section>

        <section>
          <button
            className="text-sidebar-foreground/70 group flex h-4 w-full items-center justify-between pl-1 text-left text-xs"
            onClick={() => {
              setNotebooksOpen((current) => !current);
            }}
            type="button"
          >
            <span className="leading-none">Notebooks</span>
            <ChevronRight
              className={[
                "size-3 shrink-0 self-center opacity-0 transition-all duration-200 group-hover:opacity-100",
                notebooksOpen ? "rotate-90" : "rotate-0",
              ].join(" ")}
            />
          </button>
          <div
            className={[
              "grid overflow-hidden transition-all duration-200 ease-out",
              notebooksOpen
                ? "grid-rows-[1fr] pt-1 opacity-100"
                : "grid-rows-[0fr] opacity-0",
            ].join(" ")}
          >
            <div className="min-h-0">
              {isCreatingNotebook ? (
                <div className="bg-accent/30 flex items-center gap-2 rounded-md px-3 py-1.5">
                  <BookText className="text-primary mr-1 size-4 shrink-0" />
                  <input
                    autoFocus
                    className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
                    onBlur={onHideCreateNotebook}
                    onChange={(event) =>
                      onChangeNotebookName(event.currentTarget.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        onCreateNotebook();
                      }

                      if (event.key === "Escape") {
                        onHideCreateNotebook();
                      }
                    }}
                    placeholder="Notebook name"
                    value={newNotebookName}
                  />
                </div>
              ) : null}

              <div>
                {notebooks.length > 0
                  ? notebooks.map((notebook) =>
                      editingNotebookId === notebook.id ? (
                        <div
                          className="bg-accent/30 flex items-center gap-3 rounded-md px-3 py-1.5"
                          key={notebook.id}
                        >
                          <BookText className="text-primary size-4 shrink-0" />
                          <input
                            autoFocus
                            className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
                            onBlur={onHideRenameNotebook}
                            onChange={(event) =>
                              onChangeRenamingNotebookName(
                                event.currentTarget.value,
                              )
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                onSubmitRenameNotebook();
                              }

                              if (event.key === "Escape") {
                                onHideRenameNotebook();
                              }
                            }}
                            placeholder="Notebook name"
                            value={renamingNotebookName}
                          />
                          <span className="text-muted-foreground text-xs">
                            {notebook.noteCount}
                          </span>
                        </div>
                      ) : (
                        <button
                          className={[
                            "flex w-full cursor-default items-center justify-between gap-3 rounded-md px-3 py-1.5 text-left text-sm transition-colors",
                            noteFilter === "notebook" &&
                            activeNotebookId === notebook.id
                              ? "bg-accent/80 text-secondary-foreground"
                              : "text-secondary-foreground",
                          ].join(" ")}
                          disabled={renameNotebookDisabled}
                          key={notebook.id}
                          onClick={() => onSelectNotebook(notebook.id)}
                          onContextMenu={(event) =>
                            void handleNotebookContextMenu(event, notebook.id)
                          }
                          type="button"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <BookText className="text-primary size-4 shrink-0" />
                            <span className="truncate">{notebook.name}</span>
                          </div>
                          <span className="text-muted-foreground text-xs">
                            {notebook.noteCount}
                          </span>
                        </button>
                      ),
                    )
                  : null}
              </div>
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
                className={[
                  "size-3 shrink-0 self-center opacity-0 transition-all duration-200 group-hover:opacity-100",
                  tagsOpen ? "rotate-90" : "rotate-0",
                ].join(" ")}
              />
            </button>
            <div
              className={[
                "grid overflow-hidden transition-all duration-200 ease-out",
                tagsOpen
                  ? "grid-rows-[1fr] pt-2 opacity-100"
                  : "grid-rows-[0fr] opacity-0",
              ].join(" ")}
            >
              <div className="min-h-0">
                <div className="flex flex-wrap gap-2 pl-1">
                  {availableTags.map((tag) => {
                    const isActive = activeTags.includes(tag);

                    return (
                      <button
                        className={[
                          "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                          isActive
                            ? "bg-primary/25 text-secondary-foreground"
                            : "bg-accent text-secondary-foreground hover:bg-accent/80",
                        ].join(" ")}
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

      <div className={showFooterBorder ? "border-t" : ""}>
        <Button
          className="text-muted-foreground justify-start bg-transparent px-3 hover:bg-transparent"
          onClick={onShowCreateNotebook}
          variant="ghost"
        >
          <PlusCircleIcon className="size-3.5" />
          Notebook
        </Button>
      </div>
    </aside>
  );
}
