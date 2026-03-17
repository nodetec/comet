use crate::error::AppError;
use rusqlite::Connection;
use rusqlite_migration::{Migrations, M};
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

const DATABASE_FILE: &str = "comet.db";

/// Run migrations. Call once at app startup.
pub fn init_database(app: &AppHandle) -> Result<(), AppError> {
    let database_path = database_path(app)?;
    let mut conn = Connection::open(database_path)?;
    migrations().to_latest(&mut conn)?;
    Ok(())
}

pub fn database_connection(app: &AppHandle) -> Result<Connection, AppError> {
    let database_path = database_path(app)?;
    let conn = Connection::open(database_path)?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    Ok(conn)
}

fn migrations() -> Migrations<'static> {
    Migrations::new(vec![
        M::up(
        "CREATE TABLE app_settings (
           key TEXT PRIMARY KEY,
           value TEXT NOT NULL
         );
         CREATE TABLE notebooks (
           id TEXT PRIMARY KEY,
           name TEXT NOT NULL UNIQUE,
           created_at INTEGER NOT NULL,
           updated_at INTEGER NOT NULL
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
           published_at INTEGER
         );
         CREATE TABLE note_tags (
           note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
           tag TEXT NOT NULL,
           PRIMARY KEY (note_id, tag)
         );
         CREATE TABLE relays (
           url TEXT NOT NULL,
           kind TEXT NOT NULL CHECK (kind IN ('sync', 'publish')),
           created_at INTEGER NOT NULL,
           PRIMARY KEY (url, kind)
         );
         CREATE TABLE nostr_identity (
           secret_key TEXT NOT NULL,
           public_key TEXT NOT NULL,
           npub       TEXT NOT NULL,
           created_at INTEGER NOT NULL
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
         CREATE INDEX idx_note_tags_tag ON note_tags(tag);",
        ),
        M::up(
            "ALTER TABLE notes ADD COLUMN sync_event_id TEXT;",
        ),
        M::up(
            "CREATE TABLE IF NOT EXISTS blob_meta (
               plaintext_hash  TEXT PRIMARY KEY,
               ciphertext_hash TEXT NOT NULL,
               encryption_key  TEXT NOT NULL
             );",
        ),
        M::up(
            "ALTER TABLE notebooks ADD COLUMN sync_event_id TEXT;",
        ),
        M::up(
            "ALTER TABLE notes ADD COLUMN edited_at INTEGER;
             UPDATE notes SET edited_at = modified_at;
             CREATE INDEX IF NOT EXISTS idx_notes_edited_at ON notes(edited_at DESC);",
        ),
        M::up(
            "CREATE TABLE IF NOT EXISTS pending_deletions (
               sync_event_id TEXT PRIMARY KEY,
               created_at INTEGER NOT NULL
             );",
        ),
        M::up(
            "ALTER TABLE pending_deletions RENAME COLUMN sync_event_id TO entity_id;",
        ),
        M::up(
            "ALTER TABLE notes ADD COLUMN locally_modified INTEGER NOT NULL DEFAULT 0;
             ALTER TABLE notebooks ADD COLUMN locally_modified INTEGER NOT NULL DEFAULT 0;",
        ),
        M::up(
            "ALTER TABLE notes ADD COLUMN deleted_at INTEGER;
             CREATE INDEX idx_notes_deleted_at ON notes(deleted_at);",
        ),
        M::up(
            "ALTER TABLE notes ADD COLUMN published_event_id TEXT;
             ALTER TABLE notes ADD COLUMN published_kind INTEGER;",
        ),
        M::up(
            "CREATE TABLE IF NOT EXISTS blob_uploads (
                hash TEXT NOT NULL,
                server_url TEXT NOT NULL,
                encrypted INTEGER NOT NULL DEFAULT 0,
                size_bytes INTEGER NOT NULL DEFAULT 0,
                uploaded_at INTEGER NOT NULL,
                PRIMARY KEY (hash, server_url)
            );",
        ),
        M::up(
            "DROP TABLE IF EXISTS blob_meta;
             CREATE TABLE blob_meta (
               plaintext_hash  TEXT NOT NULL,
               server_url      TEXT NOT NULL,
               ciphertext_hash TEXT NOT NULL,
               encryption_key  TEXT NOT NULL,
               PRIMARY KEY (plaintext_hash, server_url)
             );",
        ),
        M::up(
            "DROP TABLE IF EXISTS blob_meta;
             CREATE TABLE blob_meta (
               plaintext_hash  TEXT NOT NULL,
               server_url      TEXT NOT NULL,
               pubkey          TEXT NOT NULL,
               ciphertext_hash TEXT NOT NULL,
               encryption_key  TEXT NOT NULL,
               PRIMARY KEY (plaintext_hash, server_url, pubkey)
             );",
        ),
    ])
}

pub(crate) fn extract_tags(markdown: &str) -> Vec<String> {
    let bytes = markdown.as_bytes();
    let mut tags = std::collections::BTreeSet::new();
    let mut index = 0;
    let mut fence_char: u8 = 0;
    let mut fence_len: usize = 0;

    while index < bytes.len() {
        let at_line_start = index == 0 || bytes[index - 1] == b'\n';

        // Check for fenced code block delimiter (``` or ~~~, 3+ chars) at start of line
        if at_line_start && index + 2 < bytes.len() && (bytes[index] == b'`' || bytes[index] == b'~') {
            let ch = bytes[index];
            let mut run = 0;
            while index + run < bytes.len() && bytes[index + run] == ch {
                run += 1;
            }
            if run >= 3 {
                if fence_len == 0 {
                    // Open a fenced block
                    fence_char = ch;
                    fence_len = run;
                } else if ch == fence_char && run >= fence_len {
                    // Close the fenced block (closing fence must use same char and be >= opening length)
                    fence_char = 0;
                    fence_len = 0;
                }
                // Skip to end of line
                index += run;
                while index < bytes.len() && bytes[index] != b'\n' {
                    index += 1;
                }
                continue;
            }
        }

        // Skip everything inside fenced code blocks
        if fence_len > 0 {
            index += 1;
            continue;
        }

        // Skip inline code spans (handles multi-backtick delimiters like `` `code` ``)
        if bytes[index] == b'`' {
            let mut tick_count = 0;
            while index + tick_count < bytes.len() && bytes[index + tick_count] == b'`' {
                tick_count += 1;
            }
            index += tick_count;
            // Scan for matching closing backtick run
            loop {
                if index >= bytes.len() {
                    break;
                }
                if bytes[index] == b'`' {
                    let mut close_count = 0;
                    while index + close_count < bytes.len() && bytes[index + close_count] == b'`' {
                        close_count += 1;
                    }
                    index += close_count;
                    if close_count == tick_count {
                        break;
                    }
                } else {
                    index += 1;
                }
            }
            continue;
        }

        if bytes[index] != b'#' {
            index += 1;
            continue;
        }

        if index > 0 && is_tag_char(bytes[index - 1]) {
            index += 1;
            continue;
        }

        let tag_start = index + 1;
        if tag_start >= bytes.len() || !is_tag_char(bytes[tag_start]) {
            index += 1;
            continue;
        }

        let mut tag_end = tag_start;
        while tag_end < bytes.len() && is_tag_char(bytes[tag_end]) {
            tag_end += 1;
        }

        // Skip tags that are purely numeric (e.g. #2, #123)
        if bytes[tag_start..tag_end].iter().any(|b| b.is_ascii_alphabetic()) {
            let mut tag = String::from_utf8_lossy(&bytes[tag_start..tag_end]).into_owned();
            tag.make_ascii_lowercase();
            tags.insert(tag);
        }
        index = tag_end;
    }

    tags.into_iter().collect()
}

fn is_tag_char(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-'
}

fn database_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    let config_directory = app.path().app_config_dir()?;
    fs::create_dir_all(&config_directory)?;
    Ok(config_directory.join(DATABASE_FILE))
}
