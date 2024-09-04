CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status_id INTEGER,
  notebook_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  published_at TEXT,
  event_id TEXT,
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  notetype TEXT NOT NULL,
  filetype TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT,
  icon TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS note_tags (
  note_id INTEGER,
  tag_id INTEGER,
  PRIMARY KEY (note_id, tag_id),
  FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notebooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS notebook_tags (
  notebook_id INTEGER,
  tag_id INTEGER,
  PRIMARY KEY (notebook_id, tag_id),
  FOREIGN KEY (notebook_id) REFERENCES notebooks (id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
);

-- TODO: maybe add notebook
CREATE TABLE IF NOT EXISTS trash (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  tags TEXT -- Field to store tags
);

CREATE TABLE IF NOT EXISTS relay (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    write BOOLEAN NOT NULL DEFAULT TRUE,
    sync BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS nostr_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nsec TEXT NOT NULL,
    npub TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL
);

-- CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5 (title, content, content_rowid = 'id');
-- Create the FTS5 virtual table if it doesn't exist
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5 (content);

-- Insert trigger to keep FTS table in sync with the main table
CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
INSERT INTO
  notes_fts (rowid, content)
VALUES
  (new.id, new.content);

END;

-- Delete trigger to keep FTS table in sync with the main table
CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
DELETE FROM notes_fts
WHERE
  rowid = old.id;

END;

-- Update trigger to keep FTS table in sync with the main table
CREATE TRIGGER IF NOT EXISTS notes_au AFTER
UPDATE ON notes BEGIN
DELETE FROM notes_fts
WHERE
  rowid = old.id;

INSERT INTO
  notes_fts (rowid, content)
VALUES
  (new.id, new.content);

END;

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

-- Create the FTS5 virtual table if it doesn't exist
CREATE VIRTUAL TABLE IF NOT EXISTS trash_fts USING fts5 (content);

-- Insert trigger to keep FTS table in sync with the main table
CREATE TRIGGER IF NOT EXISTS trash_ai AFTER INSERT ON trash BEGIN
INSERT INTO
  trash_fts (rowid, content)
VALUES
  (new.id, new.content);

END;

-- Delete trigger to keep FTS table in sync with the main table
CREATE TRIGGER IF NOT EXISTS trash_ad AFTER DELETE ON trash BEGIN
DELETE FROM trash_fts
WHERE
  rowid = old.id;

END;

-- Update trigger to keep FTS table in sync with the main table
CREATE TRIGGER IF NOT EXISTS trash_au AFTER
UPDATE ON trash BEGIN
DELETE FROM trash_fts
WHERE
  rowid = old.id;

INSERT INTO
  trash_fts (rowid, content)
VALUES
  (new.id, new.content);

END;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes (created_at);

CREATE INDEX IF NOT EXISTS idx_notes_modified_at ON notes (modified_at);

CREATE INDEX IF NOT EXISTS idx_title ON notes (title);

CREATE INDEX IF NOT EXISTS idx_tags_name ON tags (name);

CREATE INDEX IF NOT EXISTS idx_tags_created_at ON tags (created_at);

CREATE INDEX IF NOT EXISTS idx_settings_key ON settings (key);

-- Insert initial settings only if they do not already exist
INSERT OR IGNORE INTO settings (key, value) VALUES
		-- theme
    ('theme', 'dark'),
		-- editor
		('vim', 'false'),
		('lineNumbers', 'false'),
		('highlightActiveLine', 'false'),
		('lineWrapping',        'true'),
		('indentSpaces',          '4'),
		('fontSize',            'default'),
		('fontFamily',          'SFMono-Regular, Consolas, "Liberation Mono", Menlo, Courier, monospace'),
		('lineHeight',          '2'),
		-- profile
		('npub', ''),
		('nsec', ''),
