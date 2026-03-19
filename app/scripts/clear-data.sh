#!/bin/sh

set -eu

APP_DIR="${HOME}/Library/Application Support/md.comet-alpha.dev"
DEFAULT_DB_PATH="${APP_DIR}/comet.db"
DB_PATH="${COMET_DB_PATH:-$DEFAULT_DB_PATH}"

if [ ! -f "$DB_PATH" ]; then
  echo "No database found at: $DB_PATH"
  exit 1
fi

sqlite3 "$DB_PATH" <<SQL
PRAGMA foreign_keys = OFF;

DELETE FROM notes_fts;
DELETE FROM note_tags;
DELETE FROM notes;
DELETE FROM notebooks;
DELETE FROM blob_meta;
DELETE FROM app_settings WHERE key NOT IN ('blossom_url', 'sync_checkpoint');

PRAGMA foreign_keys = ON;
SQL

echo "Cleared notes, notebooks, and tags from: $DB_PATH"
echo "Preserved: nostr_identity, relays, blossom_url"
