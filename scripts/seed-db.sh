#!/bin/sh

set -eu

APP_DIR="${HOME}/Library/Application Support/md.comet-alpha.dev"
DEFAULT_DB_PATH="${APP_DIR}/comet.db"
DB_PATH="${COMET_DB_PATH:-$DEFAULT_DB_PATH}"

mkdir -p "$(dirname "$DB_PATH")"

NOW_MS="$(($(date +%s) * 1000))"
MINUTE_MS=60000
HOUR_MS=3600000
DAY_MS=86400000

PINNED_AT="$((NOW_MS - 20 * MINUTE_MS))"
RECENT_AT="$((NOW_MS - 45 * MINUTE_MS))"
RESEARCH_AT="$((NOW_MS - 3 * HOUR_MS))"
UNCATEGORIZED_AT="$((NOW_MS - 6 * HOUR_MS))"
EMPTY_AT="$((NOW_MS - 9 * HOUR_MS))"
TITLE_MATCH_AT="$((NOW_MS - 12 * HOUR_MS))"
SHORT_QUERY_AT="$((NOW_MS - 18 * HOUR_MS))"
DEEP_MATCH_AT="$((NOW_MS - 27 * HOUR_MS))"
PERSONAL_AT="$((NOW_MS - 3 * DAY_MS))"
ARCHIVED_AT="$((NOW_MS - 2 * DAY_MS))"

sqlite3 "$DB_PATH" <<SQL
PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

DROP TABLE IF EXISTS notes_fts;
DROP TABLE IF EXISTS notes;
DROP TABLE IF EXISTS note_tags;
DROP TABLE IF EXISTS notebooks;
DROP TABLE IF EXISTS app_settings;
DROP TABLE IF EXISTS relays;
DROP TABLE IF EXISTS nostr_identity;
DROP TABLE IF EXISTS _rusqlite_migration_version;

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE notebooks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE relays (
  url TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('sync', 'publish')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (url, kind)
);

CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  markdown TEXT NOT NULL,
  notebook_id TEXT REFERENCES notebooks(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  modified_at INTEGER NOT NULL,
  archived_at INTEGER,
  pinned_at INTEGER,
  nostr_d_tag TEXT,
  published_at INTEGER,
  sync_event_id TEXT
);

CREATE TABLE blob_meta (
  plaintext_hash  TEXT PRIMARY KEY,
  ciphertext_hash TEXT NOT NULL,
  encryption_key  TEXT NOT NULL
);

CREATE TABLE nostr_identity (
  secret_key TEXT NOT NULL,
  public_key TEXT NOT NULL,
  npub       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE note_tags (
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (note_id, tag)
);

CREATE VIRTUAL TABLE notes_fts USING fts5(
  note_id UNINDEXED,
  title,
  markdown,
  tokenize = 'trigram'
);

CREATE INDEX idx_notes_modified_at ON notes(modified_at DESC);
CREATE INDEX idx_notes_active_notebook ON notes(notebook_id)
  WHERE archived_at IS NULL;
CREATE INDEX idx_notes_archived_at ON notes(archived_at);
CREATE INDEX idx_notes_pinned_at ON notes(pinned_at DESC);
CREATE INDEX idx_note_tags_tag ON note_tags(tag);

INSERT INTO notebooks (id, name, created_at, updated_at) VALUES
  ('notebook-ideas', 'Ideas', $NOW_MS, $NOW_MS),
  ('notebook-writing', 'Writing', $NOW_MS, $NOW_MS),
  ('notebook-research', 'Research', $NOW_MS, $NOW_MS),
  ('notebook-product', 'Product', $NOW_MS, $NOW_MS),
  ('notebook-personal', 'Personal', $NOW_MS, $NOW_MS);

INSERT INTO notes (
  id,
  title,
  markdown,
  notebook_id,
  created_at,
  modified_at,
  archived_at,
  pinned_at
) VALUES
  (
    'note-pinned-trail',
    'A calmer trail',
    '# A calmer trail

Comet should feel quiet, local, and dependable.

- Resume the thread quickly
- Keep the surface simple
- Let the note structure stay light

#product #design
',
    'notebook-ideas',
    $PINNED_AT,
    $PINNED_AT,
    NULL,
    $PINNED_AT
  ),
  (
    'note-writing-draft',
    'Launch draft',
    '# Launch draft

Opening copy for the first public explanation of Comet.

## Angle

Local notes. Calm UI. Clear trail.

#writing #launch
',
    'notebook-writing',
    $RECENT_AT,
    $RECENT_AT,
    NULL,
    NULL
  ),
  (
    'note-deep-match',
    'Search snippet torture test',
    '# Search snippet torture test

The first paragraph is intentionally quiet and generic.
It should not explain the match by itself.

We want to verify that search result cards show context from deeper in the note body,
especially when the matching phrase appears much later in the document than the opening lines.
The phrase velvet horizon appears here in the middle of a longer sentence so the snippet builder
has to pull useful context around it without clipping the word or returning a useless fragment.

#search #testing
',
    'notebook-product',
    $DEEP_MATCH_AT,
    $DEEP_MATCH_AT,
    NULL,
    NULL
  ),
  (
    'note-title-only-match',
    'Velvet horizon memo',
    '# Velvet horizon memo

This body intentionally avoids the searched phrase after the title.
Use this note to verify title highlighting while the card can still fall back to its normal preview.

#writing #memo
',
    'notebook-writing',
    $TITLE_MATCH_AT,
    $TITLE_MATCH_AT,
    NULL,
    NULL
  ),
  (
    'note-short-query',
    'AI notes',
    '# AI notes

AI is still a meaningful two-letter query for this app.
This note exists to exercise the short-query LIKE fallback and editor highlights.

#ai #tools
',
    'notebook-research',
    $SHORT_QUERY_AT,
    $SHORT_QUERY_AT,
    NULL,
    NULL
  ),
  (
    'note-research',
    'Research notes on note-taking apps',
    '# Research notes on note-taking apps

Bear is loved for feel.
Obsidian is loved for ownership.
There is room in the middle.

#research #market
',
    'notebook-research',
    $RESEARCH_AT,
    $RESEARCH_AT,
    NULL,
    NULL
  ),
  (
    'note-uncategorized',
    'Loose thread',
    '# Loose thread

This note is intentionally outside a notebook so the uncategorized path stays exercised.

#inbox
',
    NULL,
    $UNCATEGORIZED_AT,
    $UNCATEGORIZED_AT,
    NULL,
    NULL
  ),
  (
    'note-empty',
    'Untitled note',
    '',
    NULL,
    $EMPTY_AT,
    $EMPTY_AT,
    NULL,
    NULL
  ),
  (
    'note-personal',
    'Weekend reset',
    '# Weekend reset

Buy groceries, clean the desk, and leave time to read in the afternoon.

#personal #home
',
    'notebook-personal',
    $PERSONAL_AT,
    $PERSONAL_AT,
    NULL,
    NULL
  ),
  (
    'note-archived',
    'Old archived draft',
    '# Old archived draft

This one exists to exercise archive and restore flows.

#archive #draft
',
    'notebook-writing',
    $ARCHIVED_AT,
    $ARCHIVED_AT,
    $ARCHIVED_AT,
    NULL
  );

INSERT INTO app_settings (key, value) VALUES
  ('last_open_note_id', 'note-writing-draft'),
  ('blossom_url', 'https://comet-blossom.fly.dev');

INSERT INTO note_tags (note_id, tag) VALUES
  ('note-pinned-trail', 'design'),
  ('note-pinned-trail', 'product'),
  ('note-deep-match', 'search'),
  ('note-deep-match', 'testing'),
  ('note-title-only-match', 'memo'),
  ('note-writing-draft', 'launch'),
  ('note-writing-draft', 'writing'),
  ('note-short-query', 'ai'),
  ('note-short-query', 'tools'),
  ('note-research', 'market'),
  ('note-research', 'research'),
  ('note-uncategorized', 'inbox'),
  ('note-personal', 'home'),
  ('note-personal', 'personal'),
  ('note-archived', 'archive'),
  ('note-archived', 'draft');

INSERT INTO notes_fts (note_id, title, markdown)
SELECT id, title, markdown FROM notes;

-- Stable test identity
INSERT INTO nostr_identity (secret_key, public_key, npub, created_at) VALUES (
  '34ad98b1403b2e0cb48b6caf7591988c6bb8c2a1844c6e908b2e91b2c2f973b1',
  '55e9e957162a1ec52a453f0a7112a2d3e55ee86d964365f5cbf4fd7054db5fa2',
  'npub12h57j4ck9g0v22j98u98zy4z60j4a6rdjepktawt7n7hq4xmt73qgze79r',
  $NOW_MS
);

INSERT INTO relays (url, kind, created_at) VALUES
  ('ws://localhost:3000', 'sync', $NOW_MS),
  ('ws://localhost:3000', 'publish', $NOW_MS);

COMMIT;

-- Tell rusqlite_migration that both migrations have been applied
PRAGMA user_version = 3;

PRAGMA foreign_keys = ON;
SQL

echo "Seeded Comet database at: $DB_PATH"
