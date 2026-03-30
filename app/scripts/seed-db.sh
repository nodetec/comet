#!/bin/sh

set -eu

APP_DIR="${HOME}/Library/Application Support/md.comet-alpha.dev"
APP_DB_PATH="${APP_DIR}/app.db"
KEYCHAIN_SERVICE="comet"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
TEST_NOTES_DIR="${SCRIPT_DIR}/test-notes"
TEST_ATTACHMENTS_DIR="${SCRIPT_DIR}/test-attachments"
GENERATED_SQL_PATH="$(mktemp -t comet-seed-notes.XXXXXX.sql)"
TEMP_DB_PATH=""

cleanup() {
  rm -f "$GENERATED_SQL_PATH"
  if [ -n "$TEMP_DB_PATH" ]; then
    rm -f "$TEMP_DB_PATH" "${TEMP_DB_PATH}-shm" "${TEMP_DB_PATH}-wal"
  fi
}

trap cleanup EXIT INT TERM

if [ ! -d "$TEST_NOTES_DIR" ]; then
  echo "No test notes directory found at: $TEST_NOTES_DIR"
  exit 1
fi

if [ ! -d "$TEST_ATTACHMENTS_DIR" ]; then
  echo "No test attachments directory found at: $TEST_ATTACHMENTS_DIR"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required to generate seed data"
  exit 1
fi

if [ ! -f "$APP_DB_PATH" ]; then
  echo "No app database found at: $APP_DB_PATH"
  exit 1
fi

ACTIVE_ACCOUNT_ROW="$(sqlite3 -separator '|' "$APP_DB_PATH" "SELECT public_key, npub FROM accounts WHERE is_active = 1 LIMIT 1;")"
if [ -z "$ACTIVE_ACCOUNT_ROW" ]; then
  echo "No active account configured in: $APP_DB_PATH"
  exit 1
fi

PUBLIC_KEY="$(printf '%s' "$ACTIVE_ACCOUNT_ROW" | cut -d'|' -f1)"
NPUB="$(printf '%s' "$ACTIVE_ACCOUNT_ROW" | cut -d'|' -f2)"

ACCOUNT_DIR="${APP_DIR}/accounts/${NPUB}"
DB_PATH="${ACCOUNT_DIR}/comet.db"

mkdir -p "$(dirname "$DB_PATH")"
KEYCHAIN_ACCOUNT="nostr-nsec:${PUBLIC_KEY}"
NSEC="$(security find-generic-password -s "$KEYCHAIN_SERVICE" -a "$KEYCHAIN_ACCOUNT" -w 2>/dev/null || true)"

if [ -z "$NSEC" ]; then
  echo "No secure-storage nsec found for active account: $PUBLIC_KEY"
  exit 1
fi

ATTACHMENTS_DIR="${ACCOUNT_DIR}/attachments"

NOW_MS="$(($(date +%s) * 1000))"

node "$SCRIPT_DIR/generate-seed-notes.mjs" "$TEST_NOTES_DIR" "$NOW_MS" >"$GENERATED_SQL_PATH"
TEMP_DB_PATH="$(mktemp "${ACCOUNT_DIR}/comet.seed.XXXXXX.db")"

sqlite3 "$TEMP_DB_PATH" <<SQL
PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

DROP TABLE IF EXISTS notes_fts;
DROP TABLE IF EXISTS notes;
DROP TABLE IF EXISTS sync_heads;
DROP TABLE IF EXISTS sync_revision_parents;
DROP TABLE IF EXISTS sync_revisions;
DROP TABLE IF EXISTS sync_relay_state;
DROP TABLE IF EXISTS sync_relays;
DROP TABLE IF EXISTS note_tag_links;
DROP TABLE IF EXISTS note_tags;
DROP TABLE IF EXISTS tags;
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
  readonly INTEGER NOT NULL DEFAULT 0 CHECK (readonly IN (0, 1)),
  nostr_d_tag TEXT,
  published_at INTEGER,
  sync_event_id TEXT,
  current_rev TEXT,
  edited_at INTEGER,
  locally_modified INTEGER NOT NULL DEFAULT 0,
  deleted_at INTEGER,
  published_event_id TEXT,
  published_kind INTEGER
);

CREATE TABLE blob_uploads (
  object_hash TEXT NOT NULL,
  server_url TEXT NOT NULL,
  encrypted INTEGER NOT NULL DEFAULT 0,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  uploaded_at INTEGER NOT NULL,
  PRIMARY KEY (object_hash, server_url)
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
  nsec       TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE tags (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  parent_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
  last_segment TEXT NOT NULL,
  depth INTEGER NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  hide_subtag_notes INTEGER NOT NULL DEFAULT 0 CHECK (hide_subtag_notes IN (0, 1)),
  icon TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE note_tag_links (
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  is_direct INTEGER NOT NULL CHECK (is_direct IN (0, 1)),
  PRIMARY KEY (note_id, tag_id)
);

CREATE TABLE sync_relays (
  relay_url TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE sync_relay_state (
  relay_url TEXT PRIMARY KEY REFERENCES sync_relays(relay_url) ON DELETE CASCADE,
  checkpoint_seq INTEGER,
  snapshot_seq INTEGER,
  last_synced_at INTEGER,
  min_payload_mtime INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE TABLE sync_revisions (
  recipient TEXT NOT NULL,
  d_tag TEXT NOT NULL,
  rev TEXT NOT NULL,
  op TEXT NOT NULL CHECK (op IN ('put', 'del')),
  mtime INTEGER NOT NULL,
  entity_type TEXT,
  payload_event_id TEXT,
  payload_retained INTEGER NOT NULL DEFAULT 1 CHECK (payload_retained IN (0, 1)),
  relay_url TEXT,
  stored_seq INTEGER,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (recipient, d_tag, rev)
);

CREATE TABLE sync_revision_parents (
  recipient TEXT NOT NULL,
  d_tag TEXT NOT NULL,
  rev TEXT NOT NULL,
  parent_rev TEXT NOT NULL,
  PRIMARY KEY (recipient, d_tag, rev, parent_rev)
);

CREATE TABLE sync_heads (
  recipient TEXT NOT NULL,
  d_tag TEXT NOT NULL,
  rev TEXT NOT NULL,
  op TEXT NOT NULL CHECK (op IN ('put', 'del')),
  mtime INTEGER NOT NULL,
  PRIMARY KEY (recipient, d_tag, rev)
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
CREATE INDEX idx_tags_parent_id ON tags(parent_id);
CREATE INDEX idx_tags_depth_path ON tags(depth, path);
CREATE INDEX idx_note_tag_links_tag_id_note_id ON note_tag_links(tag_id, note_id);
CREATE INDEX idx_note_tag_links_tag_id_direct_note_id ON note_tag_links(tag_id, is_direct, note_id);
CREATE INDEX idx_note_tag_links_note_id_direct ON note_tag_links(note_id, is_direct);
CREATE INDEX idx_sync_revisions_scope ON sync_revisions(recipient, d_tag);
CREATE INDEX idx_sync_revisions_rev ON sync_revisions(rev);
CREATE INDEX idx_sync_revisions_mtime ON sync_revisions(mtime DESC);
CREATE INDEX idx_sync_revision_parents_rev ON sync_revision_parents(recipient, d_tag, rev);
CREATE INDEX idx_sync_revision_parents_parent_rev ON sync_revision_parents(recipient, d_tag, parent_rev);
CREATE INDEX idx_sync_heads_scope ON sync_heads(recipient, d_tag);
CREATE INDEX idx_sync_heads_mtime ON sync_heads(mtime DESC);

.read $GENERATED_SQL_PATH

INSERT INTO app_settings (key, value) VALUES
  ('last_open_note_id', 'note-01-luna-range-calibration'),
  ('tag_index_version', 'tag_paths_v1'),
  ('tag_index_status', 'ready'),
  ('nsec_storage', 'database'),
  ('blossom_url', 'https://media.comet.md');

INSERT INTO notes_fts (note_id, title, markdown)
SELECT id, title, markdown FROM notes;

INSERT INTO nostr_identity (public_key, npub, nsec, created_at) VALUES (
  '$PUBLIC_KEY',
  '$NPUB',
  '$NSEC',
  $NOW_MS
);

INSERT INTO relays (url, kind, created_at) VALUES
  ('wss://relay.comet.md', 'sync', $NOW_MS),
  ('wss://relay.damus.io', 'publish', $NOW_MS);

PRAGMA user_version = 6;

COMMIT;

PRAGMA foreign_keys = ON;
SQL

rm -f "$DB_PATH" "${DB_PATH}-shm" "${DB_PATH}-wal"
mv "$TEMP_DB_PATH" "$DB_PATH"
TEMP_DB_PATH=""

security add-generic-password \
  -U \
  -s "$KEYCHAIN_SERVICE" \
  -a "$KEYCHAIN_ACCOUNT" \
  -w "$NSEC" \
  >/dev/null

rm -rf "$ATTACHMENTS_DIR"
mkdir -p "$ATTACHMENTS_DIR"
node "$SCRIPT_DIR/install-seed-attachments.mjs" "$TEST_ATTACHMENTS_DIR" "$ATTACHMENTS_DIR" >/dev/null

echo "Seeded Comet database at: $DB_PATH"
echo "Loaded 50 markdown fixtures from: $TEST_NOTES_DIR"
