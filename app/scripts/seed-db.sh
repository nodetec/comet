#!/bin/sh

set -eu

APP_DIR="${HOME}/Library/Application Support/md.comet-alpha.dev"
APP_DB_PATH="${APP_DIR}/app.db"
KEYCHAIN_SERVICE="comet"

if [ ! -f "$APP_DB_PATH" ]; then
  echo "No app database found at: $APP_DB_PATH"
  exit 1
fi

ACTIVE_NPUB="$(sqlite3 "$APP_DB_PATH" "SELECT npub FROM accounts WHERE is_active = 1 LIMIT 1;")"
if [ -z "$ACTIVE_NPUB" ]; then
  echo "No active account configured in: $APP_DB_PATH"
  exit 1
fi

ACCOUNT_DIR="${APP_DIR}/accounts/${ACTIVE_NPUB}"
DB_PATH="${ACCOUNT_DIR}/comet.db"

mkdir -p "$(dirname "$DB_PATH")"

if [ ! -f "$DB_PATH" ]; then
  echo "No database found at: $DB_PATH"
  exit 1
fi

IDENTITY_ROW="$(sqlite3 -separator '|' "$DB_PATH" "SELECT public_key, npub FROM nostr_identity LIMIT 1;")"
if [ -z "$IDENTITY_ROW" ]; then
  echo "No nostr identity found in: $DB_PATH"
  exit 1
fi

PUBLIC_KEY="$(printf '%s' "$IDENTITY_ROW" | cut -d'|' -f1)"
NPUB="$(printf '%s' "$IDENTITY_ROW" | cut -d'|' -f2)"
KEYCHAIN_ACCOUNT="nostr-nsec:${PUBLIC_KEY}"
NSEC="$(security find-generic-password -s "$KEYCHAIN_SERVICE" -a "$KEYCHAIN_ACCOUNT" -w 2>/dev/null || true)"

if [ -z "$NSEC" ]; then
  echo "No secure-storage nsec found for active account: $PUBLIC_KEY"
  exit 1
fi

ATTACHMENTS_DIR="${ACCOUNT_DIR}/attachments"

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
DROP TABLE IF EXISTS blob_meta;
DROP TABLE IF EXISTS blob_uploads;
DROP TABLE IF EXISTS pending_deletions;
DROP TABLE IF EXISTS _rusqlite_migration;
DROP TABLE IF EXISTS _rusqlite_migration_version;

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE notebooks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  sync_event_id TEXT,
  locally_modified INTEGER NOT NULL DEFAULT 0
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
  sync_event_id TEXT,
  edited_at INTEGER,
  locally_modified INTEGER NOT NULL DEFAULT 0,
  deleted_at INTEGER,
  published_event_id TEXT,
  published_kind INTEGER
);

CREATE TABLE blob_uploads (
  hash TEXT NOT NULL,
  server_url TEXT NOT NULL,
  encrypted INTEGER NOT NULL DEFAULT 0,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  uploaded_at INTEGER NOT NULL,
  PRIMARY KEY (hash, server_url)
);

CREATE TABLE blob_meta (
  plaintext_hash  TEXT NOT NULL,
  server_url      TEXT NOT NULL,
  pubkey          TEXT NOT NULL,
  ciphertext_hash TEXT NOT NULL,
  encryption_key  TEXT NOT NULL,
  PRIMARY KEY (plaintext_hash, server_url, pubkey)
);

CREATE TABLE pending_deletions (
  entity_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE nostr_identity (
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
CREATE INDEX idx_notes_edited_at ON notes(edited_at DESC);
CREATE INDEX idx_notes_active_notebook ON notes(notebook_id)
  WHERE archived_at IS NULL;
CREATE INDEX idx_notes_archived_at ON notes(archived_at);
CREATE INDEX idx_notes_pinned_at ON notes(pinned_at DESC);
CREATE INDEX idx_notes_deleted_at ON notes(deleted_at);
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
  edited_at,
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
    $ARCHIVED_AT,
    NULL
  );

INSERT INTO app_settings (key, value) VALUES
  ('last_open_note_id', 'note-writing-draft'),
  ('blossom_url', 'https://comet.md');

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

INSERT INTO nostr_identity (public_key, npub, created_at) VALUES (
  '$PUBLIC_KEY',
  '$NPUB',
  $NOW_MS
);

INSERT INTO relays (url, kind, created_at) VALUES
  ('wss://comet.md', 'sync', $NOW_MS),
  ('wss://relay.damus.io', 'publish', $NOW_MS);

COMMIT;

-- Tell rusqlite_migration that both migrations have been applied
PRAGMA user_version = 13;

PRAGMA foreign_keys = ON;
SQL

security add-generic-password \
  -U \
  -s "$KEYCHAIN_SERVICE" \
  -a "$KEYCHAIN_ACCOUNT" \
  -w "$NSEC" \
  >/dev/null

rm -rf "$ATTACHMENTS_DIR"
mkdir -p "$ATTACHMENTS_DIR"

echo "Seeded Comet database at: $DB_PATH"
