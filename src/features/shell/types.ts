import type { NoteFilter } from "@/stores/use-shell-store";

export type NotebookSummary = {
  id: string;
  name: string;
  noteCount: number;
};

export type NotebookRef = {
  id: string;
  name: string;
};

export type NoteSummary = {
  archivedAt: number | null;
  id: string;
  modifiedAt: number;
  notebook: NotebookRef | null;
  pinnedAt: number | null;
  preview: string;
  searchSnippet: string | null;
  title: string;
};

export type LoadedNote = {
  archivedAt: number | null;
  id: string;
  markdown: string;
  modifiedAt: number;
  nostrDTag: string | null;
  notebook: NotebookRef | null;
  pinnedAt: number | null;
  tags: string[];
  title: string;
};

export type BootstrapPayload = {
  npub: string;
  initialNotes: NotePagePayload;
  initialTags: ContextualTagsPayload;
  notebooks: NotebookSummary[];
  selectedNoteId: string | null;
};

export type NoteSortField = "modified_at" | "created_at" | "title";
export type NoteSortDirection = "newest" | "oldest";

export type NoteQueryInput = {
  activeNotebookId: string | null;
  activeTags: string[];
  limit: number;
  noteFilter: NoteFilter;
  offset: number;
  searchQuery: string;
  sortField: NoteSortField;
  sortDirection: NoteSortDirection;
};

export type NotePagePayload = {
  hasMore: boolean;
  nextOffset: number | null;
  notes: NoteSummary[];
};

export type ContextualTagsInput = {
  activeNotebookId: string | null;
  noteFilter: NoteFilter;
};

export type ContextualTagsPayload = {
  tags: string[];
};

export type CreateNotebookInput = {
  name: string;
};

export type RenameNotebookInput = {
  notebookId: string;
  name: string;
};

export type AssignNoteNotebookInput = {
  noteId: string;
  notebookId: string | null;
};

export function notesHeading(
  noteFilter: NoteFilter,
  activeNotebook: NotebookSummary | null,
) {
  if (noteFilter === "archive") {
    return "Archive";
  }

  if (noteFilter === "today") {
    return "Today";
  }

  if (noteFilter === "notebook" && activeNotebook) {
    return activeNotebook.name;
  }

  return "All Notes";
}

export function sidebarItemClasses(isActive: boolean) {
  return [
    "flex w-full cursor-default items-center gap-3 rounded-md px-3 py-1.5 text-left text-sm transition-colors",
    isActive
      ? "bg-accent/80 text-secondary-foreground"
      : "text-secondary-foreground",
  ].join(" ");
}
