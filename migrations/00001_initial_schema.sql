-- +goose Up

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nsec TEXT NOT NULL,
    npub TEXT NOT NULL,
    active BOOLEAN NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    name TEXT,
    username TEXT,
    about TEXT,
    picture TEXT,
    nip05 TEXT,
    website TEXT,
    banner TEXT,
    lud16 TEXT,
    display_name TEXT,
    UNIQUE (nsec),
    UNIQUE (npub),
    CHECK (active IN (0, 1))
);

-- Create indexes for users table
CREATE INDEX IF NOT EXISTS idx_users_npub ON users(npub);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(active);

-- Create tags table
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT NULL,
    icon TEXT NULL,
    active BOOLEAN NOT NULL DEFAULT 0,
    inactive BOOLEAN NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    count INTEGER NOT NULL DEFAULT 0,
    UNIQUE (name),
    CHECK (name <> ''),
    CHECK (active IN (0, 1)),
    CHECK (inactive IN (0, 1)),
    CHECK (active + inactive <= 1)
);

-- Create indexes for tags table
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
CREATE INDEX IF NOT EXISTS idx_tags_active_created_at ON tags(active, created_at); -- Compound index for common query patterns

-- Create settings table
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (key)
);

-- Create indexes for settings table
CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);

-- Create relays table
CREATE TABLE IF NOT EXISTS relays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    write BOOLEAN NOT NULL DEFAULT TRUE,
    sync BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (url),
    CHECK (read IN (0, 1)),
    CHECK (write IN (0, 1)),
    CHECK (sync IN (0, 1))
);

-- Create indexes for relays table
CREATE INDEX IF NOT EXISTS idx_relays_read_write ON relays(read, write);

-- Insert default relay
INSERT INTO relays (url, read, write, sync)
SELECT 'wss://relay.notestack.com', 1, 1, 0
WHERE NOT EXISTS (SELECT 1 FROM relays);

-- Create notebooks table (create this before notes for proper foreign key relationships)
CREATE TABLE IF NOT EXISTS notebooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    pinned_at TEXT,
    display_order INTEGER DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT 0,
    UNIQUE (name),
    CHECK (name <> ''),
    CHECK (active IN (0, 1))
);

-- Create indexes for notebooks table
CREATE INDEX IF NOT EXISTS idx_notebooks_name ON notebooks(name);
CREATE INDEX IF NOT EXISTS idx_notebooks_active_pinned ON notebooks(active, pinned_at);
CREATE INDEX IF NOT EXISTS idx_notebooks_display_order ON notebooks(display_order);

-- Create notes table
CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    notebook_id INTEGER,
    content TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    content_modified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at TEXT,
    event_address TEXT,
    identifier TEXT,
    pinned_at TEXT,
    trashed_at TEXT,
    archived_at TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    author TEXT,
    FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE SET NULL,
    FOREIGN KEY (author) REFERENCES users(npub) ON DELETE SET NULL,
    CHECK (active IN (0, 1))
);

-- Create full-text search virtual table for notes content
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(content);

-- Create triggers for notes full-text search
-- +goose StatementBegin
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
-- +goose StatementEnd

-- Create indexes for notes table with optimized compound indexes
CREATE INDEX IF NOT EXISTS idx_notes_notebook_id ON notes(notebook_id);
CREATE INDEX IF NOT EXISTS idx_notes_notebook_active ON notes(notebook_id, active);
CREATE INDEX IF NOT EXISTS idx_notes_active ON notes(active);  -- For "all notes" queries
CREATE INDEX IF NOT EXISTS idx_notes_active_pinned ON notes(active, pinned_at);
CREATE INDEX IF NOT EXISTS idx_notes_active_archived ON notes(active, archived_at);
CREATE INDEX IF NOT EXISTS idx_notes_active_trashed ON notes(active, trashed_at);
CREATE INDEX IF NOT EXISTS idx_notes_active_modified ON notes(active, modified_at);
CREATE INDEX IF NOT EXISTS idx_notes_author ON notes(author);

-- Create notes_tags junction table
CREATE TABLE IF NOT EXISTS notes_tags (
    note_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, -- Added for auditing
    PRIMARY KEY (note_id, tag_id),
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
    CHECK (note_id > 0),
    CHECK (tag_id > 0)
);

-- Create indexes for notes_tags table
CREATE INDEX IF NOT EXISTS idx_notes_tags_note_id ON notes_tags(note_id);
CREATE INDEX IF NOT EXISTS idx_notes_tags_tag_id ON notes_tags(tag_id);

-- Create notebook_tags junction table
CREATE TABLE IF NOT EXISTS notebook_tags (
    notebook_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, -- Added for auditing
    PRIMARY KEY (notebook_id, tag_id),
    FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
    CHECK (notebook_id > 0),
    CHECK (tag_id > 0)
);

-- Create indexes for notebook_tags table
CREATE INDEX IF NOT EXISTS idx_notebook_tags_notebook_id ON notebook_tags(notebook_id);
CREATE INDEX IF NOT EXISTS idx_notebook_tags_tag_id ON notebook_tags(tag_id);

-- Create sort_preferences table
CREATE TABLE IF NOT EXISTS sort_preferences (
    id INTEGER PRIMARY KEY,
    notebook_id INTEGER UNIQUE,
    sort_by TEXT NOT NULL DEFAULT 'content_modified_at',
    sort_order TEXT NOT NULL DEFAULT 'desc',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE,
    CHECK (sort_order IN ('asc', 'desc')),
    CHECK (sort_by IN ('content_modified_at', 'created_at', 'title', 'modified_at'))
);

-- Create indexes for sort_preferences table
CREATE INDEX IF NOT EXISTS idx_sort_prefs_notebook_id ON sort_preferences(notebook_id);

-- Insert default sort preference
INSERT INTO sort_preferences (notebook_id, sort_by, sort_order)
SELECT NULL, 'content_modified_at', 'desc'
WHERE NOT EXISTS (SELECT 1 FROM sort_preferences WHERE notebook_id IS NULL);

-- Add triggers to enforce business rules about active states

-- +goose StatementBegin
-- Ensure only one active user at a time
CREATE TRIGGER IF NOT EXISTS enforce_single_active_user AFTER UPDATE OF active ON users
WHEN NEW.active = 1
BEGIN
    UPDATE users SET active = 0 WHERE id != NEW.id AND active = 1;
END;

-- Ensure only one active notebook at a time (or NULL for "All Notes" view)
CREATE TRIGGER IF NOT EXISTS enforce_single_active_notebook AFTER UPDATE OF active ON notebooks
WHEN NEW.active = 1
BEGIN
    UPDATE notebooks SET active = 0 WHERE id != NEW.id AND active = 1;
END;

-- Ensure only one active note at a time
CREATE TRIGGER IF NOT EXISTS enforce_single_active_note AFTER UPDATE OF active ON notes
WHEN NEW.active = 1
BEGIN
    UPDATE notes SET active = 0 WHERE id != NEW.id AND active = 1;
END;
-- +goose StatementEnd

-- +goose Down

-- Drop all tables and triggers
DROP TABLE IF EXISTS sort_preferences;
DROP TABLE IF EXISTS notebook_tags;
DROP TABLE IF EXISTS notebooks;
DROP TABLE IF EXISTS notes_tags;
DROP TABLE IF EXISTS notes;
DROP TABLE IF EXISTS relays;
DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS users;
DROP TRIGGER IF EXISTS notes_fts_insert;
DROP TRIGGER IF EXISTS notes_fts_delete;
DROP TRIGGER IF EXISTS notes_fts_update;
DROP TRIGGER IF EXISTS enforce_single_active_user;
DROP TRIGGER IF EXISTS enforce_single_active_notebook;
DROP TRIGGER IF EXISTS enforce_single_active_note;
DROP VIRTUAL TABLE IF EXISTS notes_fts;
