export type NoteFilter = "all" | "today" | "todo" | "archive" | "trash";

export type NoteSummary = {
  archivedAt: number | null;
  deletedAt: number | null;
  editedAt: number;
  hasConflict: boolean;
  id: string;
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
  pinnedAt: number | null;
  publishedAt: number | null;
  publishedKind: number | null;
  readonly: boolean;
  tags: string[];
  title: string;
};

export type NoteConflictHead = {
  isAvailable: boolean;
  isCurrent: boolean;
  markdown: string | null;
  mtime: number;
  op: string;
  preview: string | null;
  revisionId: string;
  title: string | null;
};

export type NoteConflictInfo = {
  currentRevisionId: string | null;
  headCount: number;
  heads: NoteConflictHead[];
  noteId: string;
  relayUrl: string | null;
};

export type BootstrapPayload = {
  npub: string;
  initialNotes: NotePagePayload;
  initialTags: ContextualTagsPayload;
  selectedNoteId: string | null;
  archivedCount: number;
  trashedCount: number;
};

export type NoteSortField = "modified_at" | "created_at" | "title";
export type NoteSortDirection = "newest" | "oldest";

export type NoteQueryInput = {
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
  noteFilter: NoteFilter;
};

export type ContextualTagsPayload = {
  tags: string[];
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
