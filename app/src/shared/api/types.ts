export type NoteFilter =
  | "all"
  | "today"
  | "todo"
  | "notebook"
  | "archive"
  | "trash";

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
  deletedAt: number | null;
  editedAt: number;
  id: string;
  notebook: NotebookRef | null;
  pinnedAt: number | null;
  preview: string;
  readonly: boolean;
  searchSnippet: string | null;
  title: string;
};

export type LoadedNote = {
  archivedAt: number | null;
  deletedAt: number | null;
  html: string;
  id: string;
  markdown: string;
  modifiedAt: number;
  nostrDTag: string | null;
  notebook: NotebookRef | null;
  pinnedAt: number | null;
  publishedAt: number | null;
  publishedKind: number | null;
  readonly: boolean;
  tags: string[];
  title: string;
};

export type BootstrapPayload = {
  npub: string;
  initialNotes: NotePagePayload;
  initialTags: ContextualTagsPayload;
  notebooks: NotebookSummary[];
  selectedNoteId: string | null;
  archivedCount: number;
  trashedCount: number;
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
  totalCount: number;
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

export type PublishNoteInput = {
  noteId: string;
  title: string;
  image: string | null;
  tags: string[];
};

export type PublishShortNoteInput = {
  noteId: string;
  tags: string[];
};
