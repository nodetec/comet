package schemas

// Note represents a note in the application
type Note struct {
	ID           int     `db:"id"`
	NotebookID   *int    `db:"notebook_id"`
	Content      string  `db:"content"`
	Title        string  `db:"title"`
	CreatedAt    string  `db:"created_at"`
	ModifiedAt   string  `db:"modified_at"`
	PublishedAt  *string `db:"published_at"`
	EventAddress *string `db:"event_address"`
	Identifier   *string `db:"identifier"`
	Pinned       bool    `db:"pinned"`
	TrashedAt    *string `db:"trashed_at"`
	ArchivedAt   *string `db:"archived_at"`
	Active       bool    `db:"active"`
	Author       *string `db:"author"`
}

// NotesTableSchema defines the schema for the notes table
const NotesTableSchema = `
CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    notebook_id INTEGER,
    content TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at TEXT,
    event_address TEXT,
    identifier TEXT,
    pinned BOOLEAN NOT NULL DEFAULT FALSE,
    trashed_at TEXT,
    archived_at TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    author TEXT,
    FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE SET NULL,
    CHECK (pinned IN (0, 1)),
    CHECK (active IN (0, 1))
);

CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(content);

CREATE TRIGGER IF NOT EXISTS notes_fts_insert AFTER INSERT ON notes BEGIN
    INSERT INTO notes_fts(rowid, content) VALUES (new.id, new.content);
END;

CREATE TRIGGER IF NOT EXISTS notes_fts_delete AFTER DELETE ON notes BEGIN
    DELETE FROM notes_fts WHERE rowid = old.id;
END;

CREATE TRIGGER IF NOT EXISTS notes_fts_update AFTER UPDATE ON notes BEGIN
    DELETE FROM notes_fts WHERE rowid = old.id;
    INSERT INTO notes_fts(rowid, content) VALUES (new.id, new.content);
END;

CREATE INDEX IF NOT EXISTS idx_notebook_id ON notes(notebook_id);
CREATE INDEX IF NOT EXISTS idx_created_at ON notes(created_at);
CREATE INDEX IF NOT EXISTS idx_modified_at ON notes(modified_at);
CREATE INDEX IF NOT EXISTS idx_pinned ON notes(pinned);
CREATE INDEX IF NOT EXISTS idx_trashed_at ON notes(trashed_at);
CREATE INDEX IF NOT EXISTS idx_archived_at ON notes(archived_at);
CREATE INDEX IF NOT EXISTS idx_active ON notes(active);`

// UpdateNotesModifiedAtTrigger defines the trigger for updating modified_at on update
const UpdateNotesModifiedAtTrigger = `
CREATE TRIGGER IF NOT EXISTS update_notes_modified_at
AFTER UPDATE OF content ON notes
FOR EACH ROW
BEGIN
    UPDATE notes SET modified_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;`

// EnsureOnlyOneActiveNoteTrigger defines the trigger to ensure only one active note
const EnsureOnlyOneActiveNoteTrigger = `
CREATE TRIGGER IF NOT EXISTS ensure_only_one_active_note
BEFORE UPDATE OF active ON notes
FOR EACH ROW
WHEN NEW.active = TRUE
BEGIN
    UPDATE notes SET active = FALSE WHERE active = TRUE AND id != NEW.id;
END;`
