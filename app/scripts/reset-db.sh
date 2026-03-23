#!/bin/sh

set -eu

APP_DIR="${HOME}/Library/Application Support/md.comet-alpha.dev"
APP_DB_PATH="${APP_DIR}/app.db"

escape_sql() {
  printf "%s" "$1" | sed "s/'/''/g"
}

if [ ! -f "$APP_DB_PATH" ]; then
  echo "No app database found at: $APP_DB_PATH"
  exit 1
fi

ACTIVE_ACCOUNT="$(sqlite3 -separator '|' "$APP_DB_PATH" "SELECT public_key, npub FROM accounts WHERE is_active = 1 LIMIT 1;")"
if [ -z "$ACTIVE_ACCOUNT" ]; then
  echo "No active account configured in: $APP_DB_PATH"
  exit 1
fi

ACCOUNT_PUBLIC_KEY="${ACTIVE_ACCOUNT%%|*}"
ACCOUNT_NPUB="${ACTIVE_ACCOUNT#*|}"
ACCOUNT_DIR="${APP_DIR}/accounts/${ACCOUNT_NPUB}"
DB_PATH="${ACCOUNT_DIR}/comet.db"
ESCAPED_PUBLIC_KEY="$(escape_sql "$ACCOUNT_PUBLIC_KEY")"

sqlite3 "$APP_DB_PATH" <<SQL
PRAGMA foreign_keys = ON;
BEGIN TRANSACTION;
DELETE FROM accounts WHERE public_key = '$ESCAPED_PUBLIC_KEY';
UPDATE accounts SET is_active = 0;
UPDATE accounts
SET is_active = 1
WHERE public_key = (
  SELECT public_key
  FROM accounts
  ORDER BY created_at ASC
  LIMIT 1
);
COMMIT;
SQL
echo "Removed account metadata for: $DB_PATH"

if [ -d "$ACCOUNT_DIR" ]; then
  rm -rf "$ACCOUNT_DIR"
  echo "Deleted account directory: $ACCOUNT_DIR"
else
  echo "No account directory found at: $ACCOUNT_DIR"
fi
