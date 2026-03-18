import { useState } from "react";
import {
  Archive,
  BookText,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileTextIcon,
  PlusCircleIcon,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type NoteFilter } from "@/stores/use-shell-store";
import { type NotebookSummary, sidebarItemClasses } from "@/features/shell/types";

type MobileSidebarProps = {
  activeNotebookId: string | null;
  activeTags: string[];
  archivedCount: number;
  trashedCount: number;
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
  onSelectTrash(): void;
  onEmptyTrash(): void;
  onToggleTag(tag: string): void;
  onShowRenameNotebook(notebookId: string): void;
  onSubmitRenameNotebook(): void;
  renameNotebookDisabled: boolean;
  renamingNotebookName: string;
  onNavigateToNotes(): void;
  onClose(): void;
};

export function MobileSidebar({
  activeNotebookId,
  activeTags,
  archivedCount,
  trashedCount,
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
  onSelectAll,
  onSelectToday,
  onSelectNotebook,
  onSelectArchive,
  onSelectTrash,
  onToggleTag,
  onShowCreateNotebook,
  onSubmitRenameNotebook,
  renameNotebookDisabled,
  renamingNotebookName,
  onNavigateToNotes,
  onClose,
}: MobileSidebarProps) {
  const [notesOpen, setNotesOpen] = useState(true);
  const [notebooksOpen, setNotebooksOpen] = useState(true);
  const [tagsOpen, setTagsOpen] = useState(true);

  const handleSelect = (action: () => void) => {
    action();
    onNavigateToNotes();
  };

  return (
    <div className="bg-sidebar flex h-full min-h-0 flex-col">
      <header className="border-divider flex shrink-0 items-center border-b px-4 pt-[env(safe-area-inset-top)]">
        <div className="flex h-12 items-center">
          <button
            className="text-primary -ml-1 flex items-center gap-0.5 text-sm"
            onClick={onClose}
            type="button"
          >
            <ChevronLeft className="size-5" />
            Notes
          </button>
        </div>
      </header>

      <nav className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto px-3 pt-4 pb-[env(safe-area-inset-bottom)]">
        <section>
          <button
            className="text-sidebar-foreground/70 group flex h-5 w-full items-center justify-between pl-1 text-left text-xs"
            onClick={() => setNotesOpen((c) => !c)}
            type="button"
          >
            <span className="leading-none">Notes</span>
            <ChevronRight
              className={cn(
                "size-3.5 shrink-0 transition-transform duration-200",
                notesOpen ? "rotate-90" : "rotate-0",
              )}
            />
          </button>
          {notesOpen && (
            <div className="mt-1 space-y-0.5">
              <button
                className={sidebarItemClasses(noteFilter === "all")}
                onClick={() => handleSelect(onSelectAll)}
                type="button"
              >
                <FileTextIcon className="text-primary size-5 shrink-0" />
                All Notes
              </button>
              <button
                className={sidebarItemClasses(noteFilter === "today")}
                onClick={() => handleSelect(onSelectToday)}
                type="button"
              >
                <CalendarDays className="text-primary size-5 shrink-0" />
                Today
              </button>
              {(archivedCount > 0 || noteFilter === "archive") && (
                <button
                  className={sidebarItemClasses(noteFilter === "archive")}
                  onClick={() => handleSelect(onSelectArchive)}
                  type="button"
                >
                  <Archive className="text-primary size-5 shrink-0" />
                  Archive
                </button>
              )}
              {(trashedCount > 0 || noteFilter === "trash") && (
                <button
                  className={sidebarItemClasses(noteFilter === "trash")}
                  onClick={() => handleSelect(onSelectTrash)}
                  type="button"
                >
                  <Trash2 className="text-primary size-5 shrink-0" />
                  Trash
                </button>
              )}
            </div>
          )}
        </section>

        <section>
          <button
            className="text-sidebar-foreground/70 group flex h-5 w-full items-center justify-between pl-1 text-left text-xs"
            onClick={() => setNotebooksOpen((c) => !c)}
            type="button"
          >
            <span className="leading-none">Notebooks</span>
            <ChevronRight
              className={cn(
                "size-3.5 shrink-0 transition-transform duration-200",
                notebooksOpen ? "rotate-90" : "rotate-0",
              )}
            />
          </button>
          {notebooksOpen && (
            <div className="mt-1 space-y-0.5">
              {isCreatingNotebook ? (
                <div className="bg-accent/30 flex items-center gap-3 rounded-md px-3 py-2">
                  <BookText className="text-primary size-5 shrink-0" />
                  <input
                    autoFocus
                    className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
                    onBlur={onHideCreateNotebook}
                    onChange={(e) => onChangeNotebookName(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onCreateNotebook();
                      if (e.key === "Escape") onHideCreateNotebook();
                    }}
                    placeholder="Notebook name"
                    value={newNotebookName}
                  />
                </div>
              ) : null}
              {notebooks.map((notebook) =>
                editingNotebookId === notebook.id ? (
                  <div
                    className="bg-accent/30 flex items-center gap-3 rounded-md px-3 py-2"
                    key={notebook.id}
                  >
                    <BookText className="text-primary size-5 shrink-0" />
                    <input
                      autoFocus
                      className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
                      onBlur={onHideRenameNotebook}
                      onChange={(e) =>
                        onChangeRenamingNotebookName(e.currentTarget.value)
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") onSubmitRenameNotebook();
                        if (e.key === "Escape") onHideRenameNotebook();
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
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                      noteFilter === "notebook" &&
                        activeNotebookId === notebook.id
                        ? "bg-accent/80 text-secondary-foreground"
                        : "text-secondary-foreground",
                    )}
                    disabled={renameNotebookDisabled}
                    key={notebook.id}
                    onClick={() =>
                      handleSelect(() => onSelectNotebook(notebook.id))
                    }
                    type="button"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <BookText className="text-primary size-5 shrink-0" />
                      <span className="truncate">{notebook.name}</span>
                    </div>
                    <span className="text-muted-foreground text-xs">
                      {notebook.noteCount}
                    </span>
                  </button>
                ),
              )}
            </div>
          )}
        </section>

        {availableTags.length > 0 && (
          <section>
            <button
              className="text-sidebar-foreground/70 group flex h-5 w-full items-center justify-between pl-1 text-left text-xs"
              onClick={() => setTagsOpen((c) => !c)}
              type="button"
            >
              <span className="leading-none">Tags</span>
              <ChevronRight
                className={cn(
                  "size-3.5 shrink-0 transition-transform duration-200",
                  tagsOpen ? "rotate-90" : "rotate-0",
                )}
              />
            </button>
            {tagsOpen && (
              <div className="mt-2 flex flex-wrap gap-2 pl-1">
                {availableTags.map((tag) => (
                  <button
                    className={cn(
                      "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                      activeTags.includes(tag)
                        ? "bg-primary/25 text-secondary-foreground"
                        : "bg-accent text-secondary-foreground",
                    )}
                    key={tag}
                    onClick={() => onToggleTag(tag)}
                    type="button"
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
      </nav>

      <div className="border-divider border-t px-3 pb-[env(safe-area-inset-bottom)]">
        <Button
          className="text-muted-foreground justify-start bg-transparent px-3 hover:bg-transparent"
          onClick={onShowCreateNotebook}
          variant="ghost"
        >
          <PlusCircleIcon className="size-4" />
          New Notebook
        </Button>
      </div>
    </div>
  );
}
