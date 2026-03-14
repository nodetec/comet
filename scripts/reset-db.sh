#!/bin/sh

set -eu

APP_DIR="${HOME}/Library/Application Support/app.comet.desktop"
DEFAULT_DB_PATH="${APP_DIR}/comet.db"
DB_PATH="${COMET_DB_PATH:-$DEFAULT_DB_PATH}"

if [ -f "$DB_PATH" ]; then
  rm "$DB_PATH"
  echo "Deleted: $DB_PATH"
else
  echo "No database found at: $DB_PATH"
fi
