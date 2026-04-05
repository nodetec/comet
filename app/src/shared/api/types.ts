export type NoteFilter =
  | "all"
  | "today"
  | "todo"
  | "pinned"
  | "untagged"
  | "archive"
  | "trash";

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

export type NoteConflictSnapshot = {
  deletedAt: number | null;
  isAvailable: boolean;
  isCurrent: boolean;
  markdown: string | null;
  mtime: number;
  op: string;
  preview: string | null;
  snapshotId: string;
  title: string | null;
};

export type NoteConflictInfo = {
  currentSnapshotId: string | null;
  hasDeleteCandidate: boolean;
  snapshotCount: number;
  snapshots: NoteConflictSnapshot[];
  noteId: string;
  relayUrl: string | null;
};

export type NoteHistorySnapshot = {
  deletedAt: number | null;
  isConflict: boolean;
  isCurrent: boolean;
  markdown: string | null;
  mtime: number;
  op: string;
  preview: string | null;
  snapshotId: string;
  title: string | null;
};

export type NoteHistoryInfo = {
  noteId: string;
  snapshotCount: number;
  snapshots: NoteHistorySnapshot[];
};

export type ResolveNoteConflictAction = "restore" | "keep_deleted" | "merge";

export type BootstrapPayload = {
  npub: string;
  initialNotes: NotePagePayload;
  initialTags: ContextualTagsPayload;
  selectedNoteId: string | null;
  archivedCount: number;
  trashedCount: number;
};

export type AccountSummary = {
  publicKey: string;
  npub: string;
  isActive: boolean;
};

export type SecretStorageStatus = {
  storage: "database" | "keychain";
};

export type AppStatus = {
  version: string;
  appDatabasePath: string;
  accountPath: string;
  databasePath: string;
  attachmentsPath: string;
  themesPath: string;
  activeNpub: string;
};

export type ThemeAppearance = "dark" | "light";

export type ThemeData = {
  appearance: ThemeAppearance;
  name: string;
  uiFont: string;
  colors: Record<string, string>;
};

export type ThemeSummary = {
  id: string;
  name: string;
};

export type TagIndexDiagnostics = {
  version: string | null;
  status: string | null;
  lastRebuiltAt: number | null;
  tagCount: number;
  linkCount: number;
  directLinkCount: number;
};

export type NoteSortField = "modified_at" | "created_at" | "title";
export type NoteSortDirection = "newest" | "oldest";

export type NoteQueryInput = {
  activeTagPath: string | null;
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

export type RenameTagInput = {
  fromPath: string;
  toPath: string;
};

export type DeleteTagInput = {
  path: string;
};

export type SetTagPinnedInput = {
  path: string;
  pinned: boolean;
};

export type SetHideSubtagNotesInput = {
  hideSubtagNotes: boolean;
  path: string;
};

export type ContextualTagNode = {
  children: ContextualTagNode[];
  depth: number;
  directNoteCount: number;
  hideSubtagNotes: boolean;
  inclusiveNoteCount: number;
  label: string;
  path: string;
  pinned: boolean;
};

export type ContextualTagsPayload = {
  roots: ContextualTagNode[];
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

export type ExportMode = "note_filter" | "tag";

export type ExportNotesInput = {
  exportMode: ExportMode;
  noteFilter?: NoteFilter;
  tagPath?: string;
  preserveTags?: boolean;
  exportDir: string;
};
