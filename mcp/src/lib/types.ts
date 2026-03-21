export type NotebookRef = {
  id: string;
  name: string;
};

export type NoteSummary = {
  id: string;
  title: string;
  notebook: NotebookRef | null;
  editedAt: number;
  preview: string;
  archivedAt: number | null;
  deletedAt: number | null;
  pinnedAt: number | null;
};

export type LoadedNote = {
  id: string;
  title: string;
  markdown: string;
  modifiedAt: number;
  notebook: NotebookRef | null;
  archivedAt: number | null;
  deletedAt: number | null;
  pinnedAt: number | null;
  tags: string[];
};

export type NotebookSummary = {
  id: string;
  name: string;
  noteCount: number;
};

export type NoteFilter =
  | "all"
  | "today"
  | "todo"
  | "archive"
  | "trash"
  | "notebook";

export type NoteSortField = "modified_at" | "created_at" | "title";
export type NoteSortDirection = "newest" | "oldest";

export type NotePagePayload = {
  notes: NoteSummary[];
  hasMore: boolean;
  nextOffset: number | null;
  totalCount: number;
};

export type SearchResult = {
  id: string;
  title: string;
  notebook: NotebookRef | null;
  preview: string;
  archivedAt: number | null;
};
