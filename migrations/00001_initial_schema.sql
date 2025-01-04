-- +goose Up

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nsec TEXT NOT NULL,
    npub TEXT NOT NULL,
    active BOOLEAN NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
    modified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
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
CREATE INDEX IF NOT EXISTS idx_nsec ON users(nsec);
CREATE INDEX IF NOT EXISTS idx_npub ON users(npub);
CREATE INDEX IF NOT EXISTS idx_active ON users(active);

-- Create tags table
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT NULL,
    icon TEXT NULL,
    active BOOLEAN NOT NULL DEFAULT 0,
    inactive BOOLEAN NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
    modified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
    UNIQUE (name),
    CHECK (name <> ''),
    CHECK (active + inactive <= 1)
);

-- Create indexes for tags table
CREATE INDEX IF NOT EXISTS idx_name ON tags(name);
CREATE INDEX IF NOT EXISTS idx_created_at ON tags(created_at);
CREATE INDEX IF NOT EXISTS idx_active ON tags(active);

-- Create settings table
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
    modified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
    UNIQUE (key)
);

-- Create indexes for settings table
CREATE INDEX IF NOT EXISTS idx_key ON settings(key);
CREATE INDEX IF NOT EXISTS idx_created_at ON settings(created_at);

-- Create relays table
CREATE TABLE IF NOT EXISTS relays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    write BOOLEAN NOT NULL DEFAULT TRUE,
    sync BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
    modified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
    CHECK (read IN (0, 1)),
    CHECK (write IN (0, 1)),
    CHECK (sync IN (0, 1))
);

-- Create indexes for relays table
CREATE INDEX IF NOT EXISTS idx_url ON relays(url);
CREATE INDEX IF NOT EXISTS idx_created_at ON relays(created_at);

-- Insert default relay
INSERT INTO relays (url, read, write, sync, created_at, modified_at)
SELECT 'wss://relay.notestack.com', 1, 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM relays);

-- Create notes table
CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    notebook_id INTEGER,
    content TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
    modified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
    content_modified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
    published_at TEXT,
    event_address TEXT,
    identifier TEXT,
    pinned_at TEXT,
    trashed_at TEXT,
    archived_at TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    author TEXT,
    FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE SET NULL,
    CHECK (active IN (0, 1))
);

-- Create full-text search virtual table for notes
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(content);

-- Create triggers for notes full-text search
-- CREATE TRIGGER IF NOT EXISTS notes_fts_insert AFTER INSERT ON notes BEGIN
--     INSERT INTO notes_fts(rowid, content) VALUES (new.id, new.content);
-- END;

-- CREATE TRIGGER IF NOT EXISTS notes_fts_delete AFTER DELETE ON notes BEGIN
--     DELETE FROM notes_fts WHERE rowid = old.id;
-- END;

-- CREATE TRIGGER IF NOT EXISTS notes_fts_update AFTER UPDATE ON notes BEGIN
--     DELETE FROM notes_fts WHERE rowid = old.id;
--     INSERT INTO notes_fts(rowid, content) VALUES (new.id, new.content);
-- END;

-- Create indexes for notes table
CREATE INDEX IF NOT EXISTS idx_notebook_id ON notes(notebook_id);
CREATE INDEX IF NOT EXISTS idx_created_at ON notes(created_at);
CREATE INDEX IF NOT EXISTS idx_modified_at ON notes(modified_at);
CREATE INDEX IF NOT EXISTS idx_pinned_at ON notes(pinned_at);
CREATE INDEX IF NOT EXISTS idx_trashed_at ON notes(trashed_at);
CREATE INDEX IF NOT EXISTS idx_archived_at ON notes(archived_at);
CREATE INDEX IF NOT EXISTS idx_active ON notes(active);

-- Create notes_tags junction table
CREATE TABLE IF NOT EXISTS notes_tags (
    note_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (note_id, tag_id),
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
    CHECK (note_id > 0),
    CHECK (tag_id > 0)
);

-- Create indexes for notes_tags table
CREATE INDEX IF NOT EXISTS idx_note_id ON notes_tags(note_id);
CREATE INDEX IF NOT EXISTS idx_tag_id ON notes_tags(tag_id);

-- Create notebooks table
CREATE TABLE IF NOT EXISTS notebooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
    modified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
    pinned_at TEXT,
    display_order INTEGER DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT 0,
    UNIQUE (name),
    CHECK (name <> '')
);

-- Create indexes for notebooks table
CREATE INDEX IF NOT EXISTS idx_name ON notebooks(name);
CREATE INDEX IF NOT EXISTS idx_created_at ON notebooks(created_at);
CREATE INDEX IF NOT EXISTS idx_pinned_at ON notebooks(pinned_at);
CREATE INDEX IF NOT EXISTS idx_display_order ON notebooks(display_order);

-- Create notebook_tags junction table
CREATE TABLE IF NOT EXISTS notebook_tags (
    notebook_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (notebook_id, tag_id),
    FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
    CHECK (notebook_id > 0),
    CHECK (tag_id > 0)
);

-- Create indexes for notebook_tags table
CREATE INDEX IF NOT EXISTS idx_notebook_id ON notebook_tags(notebook_id);
CREATE INDEX IF NOT EXISTS idx_tag_id ON notebook_tags(tag_id);

-- +goose Down

-- Drop all tables and triggers
DROP TABLE IF EXISTS notebook_tags;
DROP TABLE IF NOT EXISTS notebooks;
DROP TABLE IF NOT EXISTS notes_tags;
DROP TABLE IF NOT EXISTS notes;
DROP TABLE IF NOT EXISTS relays;
DROP TABLE IF NOT EXISTS settings;
DROP TABLE IF NOT EXISTS tags;
DROP TABLE IF NOT EXISTS users;
DROP TRIGGER IF NOT EXISTS notes_fts_insert;
DROP TRIGGER IF NOT EXISTS notes_fts_delete;
DROP TRIGGER IF NOT EXISTS notes_fts_update;
DROP TRIGGER IF NOT EXISTS update_users_modified_at;
DROP TRIGGER IF NOT EXISTS update_tags_modified_at;
DROP TRIGGER IF NOT EXISTS update_settings_modified_at;
DROP TRIGGER IF NOT EXISTS update_relays_modified_at;
DROP TRIGGER IF NOT EXISTS update_notes_modified_at;
DROP TRIGGER IF NOT EXISTS update_notes_content_modified_at;
DROP TRIGGER IF NOT EXISTS enforce_single_active_user;
DROP TRIGGER IF NOT EXISTS ensure_only_one_active_note;
