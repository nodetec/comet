// Bridge layer wrapping the uniffi-generated native bindings.
// Until the Rust module is compiled with `yarn ubrn:ios`, this uses
// an in-memory mock so the UI is fully functional for development.

import type {
  BootstrapPayload,
  LoadedNote,
  NotePagePayload,
  NoteQueryInput,
  SaveNoteInput,
  ContextualTagsInput,
  ContextualTagsPayload,
  SearchResult,
  NotebookSummary,
  Relay,
  SyncState,
  SyncInfo,
  AccountSummary,
  BlobFetchStatus,
} from './types';

// ---------------------------------------------------------------------------
// In-memory store (replaced by Rust SQLite when native module is ready)
// ---------------------------------------------------------------------------

let notes: LoadedNote[] = [];
let nextId = 1;

function now(): number {
  return Date.now();
}

function titleFromMarkdown(md: string): string {
  const match = md.match(/^#\s+(.+)/m);
  return match?.[1]?.trim() || 'Untitled';
}

function previewFromMarkdown(md: string): string {
  return md
    .split('\n')
    .filter((l) => !l.startsWith('# ') && l.trim().length > 0)
    .slice(0, 2)
    .join(' ')
    .slice(0, 140);
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

export function initApp(
  _baseDir: string,
  _eventEmitter?: { emit: (name: string, payload: string) => void } | null,
): void {
  // no-op in mock mode
}

// ---------------------------------------------------------------------------
// Notes — queries
// ---------------------------------------------------------------------------

export function getBootstrap(): BootstrapPayload {
  const activeNotes = notes.filter(
    (n) => n.archivedAt == null && n.deletedAt == null,
  );
  return {
    npub: 'npub1mock...',
    notebooks: [],
    selectedNoteId: activeNotes[0]?.id ?? null,
    initialNotes: {
      notes: activeNotes.map((n) => ({
        id: n.id,
        title: n.title,
        notebook: n.notebook,
        editedAt: n.modifiedAt,
        preview: previewFromMarkdown(n.markdown),
        searchSnippet: null,
        archivedAt: n.archivedAt,
        deletedAt: n.deletedAt,
        pinnedAt: n.pinnedAt,
        readonly: n.readonly,
      })),
      hasMore: false,
      nextOffset: null,
      totalCount: activeNotes.length,
    },
    initialTags: { tags: [] },
    archivedCount: notes.filter((n) => n.archivedAt != null).length,
    trashedCount: notes.filter((n) => n.deletedAt != null).length,
  };
}

export function getTodoCount(): number {
  return 0;
}

export function queryNotes(input: NoteQueryInput): NotePagePayload {
  let filtered = [...notes];

  if (input.noteFilter === 'archive') {
    filtered = filtered.filter((n) => n.archivedAt != null);
  } else if (input.noteFilter === 'trash') {
    filtered = filtered.filter((n) => n.deletedAt != null);
  } else {
    filtered = filtered.filter(
      (n) => n.archivedAt == null && n.deletedAt == null,
    );
  }

  if (input.searchQuery) {
    const q = input.searchQuery.toLowerCase();
    filtered = filtered.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.markdown.toLowerCase().includes(q),
    );
  }

  filtered.sort((a, b) => b.modifiedAt - a.modifiedAt);

  const offset = input.offset;
  const limit = input.limit;
  const page = filtered.slice(offset, offset + limit);

  return {
    notes: page.map((n) => ({
      id: n.id,
      title: n.title,
      notebook: n.notebook,
      editedAt: n.modifiedAt,
      preview: previewFromMarkdown(n.markdown),
      searchSnippet: null,
      archivedAt: n.archivedAt,
      deletedAt: n.deletedAt,
      pinnedAt: n.pinnedAt,
      readonly: n.readonly,
    })),
    hasMore: offset + limit < filtered.length,
    nextOffset:
      offset + limit < filtered.length ? offset + limit : null,
    totalCount: filtered.length,
  };
}

export function getContextualTags(
  _input: ContextualTagsInput,
): ContextualTagsPayload {
  return { tags: [] };
}

export function loadNote(noteId: string): LoadedNote {
  const note = notes.find((n) => n.id === noteId);
  if (!note) throw new Error(`Note ${noteId} not found`);
  return { ...note };
}

export function searchNotes(query: string): SearchResult[] {
  const q = query.toLowerCase();
  return notes
    .filter(
      (n) =>
        n.archivedAt == null &&
        n.deletedAt == null &&
        (n.title.toLowerCase().includes(q) ||
          n.markdown.toLowerCase().includes(q)),
    )
    .slice(0, 20)
    .map((n) => ({
      id: n.id,
      title: n.title,
      notebook: n.notebook,
      preview: previewFromMarkdown(n.markdown),
      archivedAt: n.archivedAt,
    }));
}

export function searchTags(_query: string): string[] {
  return [];
}

// ---------------------------------------------------------------------------
// Notes — mutations
// ---------------------------------------------------------------------------

export function createNote(
  notebookId: string | null,
  _tags: string[],
  markdown?: string | null,
): LoadedNote {
  const id = `note-${nextId++}`;
  const md = markdown ?? '# ';
  const note: LoadedNote = {
    id,
    title: titleFromMarkdown(md),
    notebook: null,
    modifiedAt: now(),
    markdown: md,
    archivedAt: null,
    deletedAt: null,
    pinnedAt: null,
    readonly: false,
    tags: [],
    nostrDTag: null,
    publishedAt: null,
    publishedKind: null,
  };
  notes.unshift(note);
  return { ...note };
}

export function duplicateNote(noteId: string): LoadedNote {
  const source = notes.find((n) => n.id === noteId);
  if (!source) throw new Error(`Note ${noteId} not found`);
  return createNote(null, [], source.markdown);
}

export function saveNote(input: SaveNoteInput): LoadedNote {
  const note = notes.find((n) => n.id === input.id);
  if (!note) throw new Error(`Note ${input.id} not found`);
  note.markdown = input.markdown;
  note.title = titleFromMarkdown(input.markdown);
  note.modifiedAt = now();
  return { ...note };
}

export function archiveNote(noteId: string): LoadedNote {
  const note = notes.find((n) => n.id === noteId);
  if (!note) throw new Error(`Note ${noteId} not found`);
  note.archivedAt = now();
  note.modifiedAt = now();
  return { ...note };
}

export function restoreNote(noteId: string): LoadedNote {
  const note = notes.find((n) => n.id === noteId);
  if (!note) throw new Error(`Note ${noteId} not found`);
  note.archivedAt = null;
  note.modifiedAt = now();
  return { ...note };
}

export function trashNote(noteId: string): LoadedNote {
  const note = notes.find((n) => n.id === noteId);
  if (!note) throw new Error(`Note ${noteId} not found`);
  note.deletedAt = now();
  note.modifiedAt = now();
  return { ...note };
}

export function restoreFromTrash(noteId: string): LoadedNote {
  const note = notes.find((n) => n.id === noteId);
  if (!note) throw new Error(`Note ${noteId} not found`);
  note.deletedAt = null;
  note.modifiedAt = now();
  return { ...note };
}

export function deleteNotePermanently(noteId: string): void {
  notes = notes.filter((n) => n.id !== noteId);
}

export function emptyTrash(): void {
  notes = notes.filter((n) => n.deletedAt == null);
}

export function pinNote(noteId: string): LoadedNote {
  const note = notes.find((n) => n.id === noteId);
  if (!note) throw new Error(`Note ${noteId} not found`);
  note.pinnedAt = now();
  note.modifiedAt = now();
  return { ...note };
}

export function unpinNote(noteId: string): LoadedNote {
  const note = notes.find((n) => n.id === noteId);
  if (!note) throw new Error(`Note ${noteId} not found`);
  note.pinnedAt = null;
  note.modifiedAt = now();
  return { ...note };
}

// ---------------------------------------------------------------------------
// Notebooks
// ---------------------------------------------------------------------------

export function createNotebook(name: string): NotebookSummary {
  return { id: `notebook-${nextId++}`, name, noteCount: 0 };
}

export function renameNotebook(
  notebookId: string,
  name: string,
): NotebookSummary {
  return { id: notebookId, name, noteCount: 0 };
}

export function deleteNotebook(_notebookId: string): void {}

export function assignNoteNotebook(
  noteId: string,
  _notebookId: string | null,
): LoadedNote {
  const note = notes.find((n) => n.id === noteId);
  if (!note) throw new Error(`Note ${noteId} not found`);
  return { ...note };
}

// ---------------------------------------------------------------------------
// Sync & Relays (stubs — no-op in mock mode)
// ---------------------------------------------------------------------------

export function listRelays(): Relay[] {
  return [];
}

export function setSyncRelay(_url: string): Relay[] {
  return [];
}

export function removeSyncRelay(): Relay[] {
  return [];
}

export function addPublishRelay(_url: string): Relay[] {
  return [];
}

export function removeRelay(_url: string, _kind: string): Relay[] {
  return [];
}

export async function getSyncStatus(): Promise<SyncState> {
  return { type: 'disconnected' };
}

export function isSyncEnabled(): boolean {
  return false;
}

export async function setSyncEnabled(_enabled: boolean): Promise<void> {}

export async function restartSync(): Promise<void> {}

export async function resync(): Promise<void> {}

export async function unlockCurrentAccount(_nsec: string): Promise<void> {}

export async function getSyncInfo(): Promise<SyncInfo> {
  return {
    state: { type: 'disconnected' },
    relayUrl: null,
    blossomUrl: null,
    npub: 'npub1mock...',
    syncedNotes: 0,
    syncedNotebooks: 0,
    pendingNotes: 0,
    pendingNotebooks: 0,
    totalNotes: notes.filter((n) => n.archivedAt == null && n.deletedAt == null)
      .length,
    checkpoint: 0,
    blobsStored: 0,
  };
}

// ---------------------------------------------------------------------------
// Blob (stubs)
// ---------------------------------------------------------------------------

export function getBlossomUrl(): string | null {
  return null;
}

export function setBlossomUrl(_url: string): void {}

export async function fetchBlob(_hash: string): Promise<BlobFetchStatus> {
  return 'missing';
}

// ---------------------------------------------------------------------------
// Accounts (stubs)
// ---------------------------------------------------------------------------

export function listAccounts(): AccountSummary[] {
  return [{ publicKey: 'mock', npub: 'npub1mock...', isActive: true }];
}

export async function addAccount(_nsec: string): Promise<AccountSummary> {
  return { publicKey: 'mock', npub: 'npub1mock...', isActive: true };
}

export async function switchAccount(
  _publicKey: string,
): Promise<AccountSummary> {
  return { publicKey: 'mock', npub: 'npub1mock...', isActive: true };
}
