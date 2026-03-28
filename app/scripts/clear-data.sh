#!/bin/sh

set -eu

APP_DIR="${HOME}/Library/Application Support/md.comet-alpha.dev"
APP_DB_PATH="${APP_DIR}/app.db"

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

if [ ! -f "$DB_PATH" ]; then
  echo "No database found at: $DB_PATH"
  exit 1
fi

ATTACHMENTS_DIR="${ACCOUNT_DIR}/attachments"

sqlite3 "$DB_PATH" <<SQL
PRAGMA foreign_keys = OFF;

DELETE FROM notes_fts;
DELETE FROM note_tag_links;
DELETE FROM tags;
DELETE FROM notes;
DELETE FROM notebooks;
DELETE FROM blob_meta;
DELETE FROM blob_uploads;
DELETE FROM pending_deletions;
DELETE FROM app_settings WHERE key != 'blossom_url';

PRAGMA foreign_keys = ON;
SQL

rm -rf "$ATTACHMENTS_DIR"
mkdir -p "$ATTACHMENTS_DIR"

echo "Cleared notes, notebooks, and tags from: $DB_PATH"
echo "Preserved: nostr_identity, relays, blossom_url"
