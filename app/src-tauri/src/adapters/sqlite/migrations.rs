use rusqlite_migration::{Migrations, M};

pub fn app_migrations() -> Migrations<'static> {
    Migrations::new(vec![M::up(
        "CREATE TABLE IF NOT EXISTS accounts (
           public_key TEXT PRIMARY KEY,
           npub       TEXT NOT NULL UNIQUE,
           label      TEXT,
           db_path    TEXT NOT NULL UNIQUE,
           created_at INTEGER NOT NULL,
           updated_at INTEGER NOT NULL,
           is_active  INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1))
         );
         CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_active
           ON accounts(is_active)
           WHERE is_active = 1;
         CREATE TABLE IF NOT EXISTS mcp_account_access (
           principal          TEXT NOT NULL,
           account_public_key TEXT NOT NULL REFERENCES accounts(public_key) ON DELETE CASCADE ON UPDATE CASCADE,
           scope_mode         TEXT NOT NULL DEFAULT 'all' CHECK (scope_mode IN ('all', 'selected')),
           can_read           INTEGER NOT NULL DEFAULT 1 CHECK (can_read IN (0, 1)),
           can_write          INTEGER NOT NULL DEFAULT 1 CHECK (can_write IN (0, 1)),
           can_publish        INTEGER NOT NULL DEFAULT 0 CHECK (can_publish IN (0, 1)),
           allow_unfiled      INTEGER NOT NULL DEFAULT 1 CHECK (allow_unfiled IN (0, 1)),
           created_at         INTEGER NOT NULL,
           updated_at         INTEGER NOT NULL,
           PRIMARY KEY (principal, account_public_key)
         );",
    )])
}

pub fn account_migrations() -> Migrations<'static> {
    Migrations::new(vec![
        M::up(
            "CREATE TABLE app_settings (
               key TEXT PRIMARY KEY,
               value TEXT NOT NULL
             );
             CREATE TABLE notes (
               id TEXT PRIMARY KEY,
               title TEXT NOT NULL,
               markdown TEXT NOT NULL,
               created_at INTEGER NOT NULL,
               modified_at INTEGER NOT NULL,
               last_edit_device_id TEXT,
               vector_clock TEXT NOT NULL DEFAULT '{}',
               archived_at INTEGER,
               pinned_at INTEGER,
               readonly INTEGER NOT NULL DEFAULT 0 CHECK (readonly IN (0, 1)),
               nostr_d_tag TEXT,
               published_at INTEGER,
               sync_event_id TEXT,
               edited_at INTEGER,
               locally_modified INTEGER NOT NULL DEFAULT 0,
               deleted_at INTEGER,
               published_event_id TEXT,
               published_kind INTEGER
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
               public_key TEXT NOT NULL,
               npub       TEXT NOT NULL,
               created_at INTEGER NOT NULL
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
             CREATE VIRTUAL TABLE notes_fts USING fts5(
               note_id UNINDEXED,
               title,
               markdown,
               tokenize = 'trigram'
             );
             CREATE INDEX idx_notes_modified_at ON notes(modified_at DESC);
             CREATE INDEX idx_notes_edited_at ON notes(edited_at DESC);
             CREATE INDEX idx_notes_archived_at ON notes(archived_at);
             CREATE INDEX idx_notes_pinned_at ON notes(pinned_at DESC);
             CREATE INDEX idx_notes_deleted_at ON notes(deleted_at);
             CREATE INDEX idx_note_tags_tag ON note_tags(tag);",
        ),
        M::up(
            "CREATE TABLE sync_relays (
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
             CREATE TABLE sync_snapshots (
               author_pubkey TEXT NOT NULL,
               d_tag TEXT NOT NULL,
               snapshot_id TEXT NOT NULL,
               op TEXT NOT NULL CHECK (op IN ('put', 'del')),
               mtime INTEGER NOT NULL,
               entity_type TEXT,
               event_id TEXT,
               payload_retained INTEGER NOT NULL DEFAULT 1 CHECK (payload_retained IN (0, 1)),
               relay_url TEXT,
               stored_seq INTEGER,
               created_at INTEGER NOT NULL,
               PRIMARY KEY (author_pubkey, d_tag, snapshot_id)
             );
             CREATE INDEX idx_sync_snapshots_scope ON sync_snapshots(author_pubkey, d_tag);
             CREATE INDEX idx_sync_snapshots_snapshot_id ON sync_snapshots(snapshot_id);
             CREATE INDEX idx_sync_snapshots_mtime ON sync_snapshots(mtime DESC);",
        ),
        M::up("ALTER TABLE blob_uploads RENAME COLUMN hash TO object_hash;"),
        M::up("DELETE FROM app_settings WHERE key = 'sync_checkpoint';"),
        M::up(
            "CREATE TABLE tags (
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
             CREATE INDEX idx_tags_parent_id ON tags(parent_id);
             CREATE INDEX idx_tags_depth_path ON tags(depth, path);
             CREATE TABLE note_tag_links (
               note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
               tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
               is_direct INTEGER NOT NULL CHECK (is_direct IN (0, 1)),
               PRIMARY KEY (note_id, tag_id)
             );
             CREATE INDEX idx_note_tag_links_tag_id_note_id ON note_tag_links(tag_id, note_id);
             CREATE INDEX idx_note_tag_links_tag_id_direct_note_id ON note_tag_links(tag_id, is_direct, note_id);
             CREATE INDEX idx_note_tag_links_note_id_direct ON note_tag_links(note_id, is_direct);
             INSERT INTO app_settings (key, value) VALUES ('tag_index_version', 'tag_paths_v1')
               ON CONFLICT(key) DO UPDATE SET value = excluded.value;
             INSERT INTO app_settings (key, value) VALUES ('tag_index_status', 'pending')
               ON CONFLICT(key) DO UPDATE SET value = excluded.value;",
        ),
        M::up(
            "ALTER TABLE nostr_identity ADD COLUMN nsec TEXT;
             INSERT INTO app_settings (key, value) VALUES ('nsec_storage', 'keychain')
               ON CONFLICT(key) DO NOTHING;",
        ),
        M::up(
            "CREATE TABLE pending_blob_uploads (
               plaintext_hash  TEXT PRIMARY KEY,
               server_url      TEXT NOT NULL,
               pubkey          TEXT NOT NULL,
               ciphertext_hash TEXT NOT NULL,
               encryption_key  TEXT NOT NULL,
               ciphertext      BLOB NOT NULL,
               content_type    TEXT NOT NULL DEFAULT 'application/octet-stream',
               size_bytes      INTEGER NOT NULL,
               last_error      TEXT,
               created_at      INTEGER NOT NULL,
               updated_at      INTEGER NOT NULL
             );
             CREATE INDEX idx_pending_blob_uploads_updated_at
               ON pending_blob_uploads(updated_at DESC);",
        ),
        M::up(
            "CREATE TABLE note_tombstones (
               id TEXT PRIMARY KEY,
               deleted_at INTEGER NOT NULL,
               last_edit_device_id TEXT NOT NULL,
               vector_clock TEXT NOT NULL DEFAULT '{}',
               sync_event_id TEXT,
               locally_modified INTEGER NOT NULL DEFAULT 0 CHECK (locally_modified IN (0, 1))
             );
             CREATE INDEX idx_note_tombstones_deleted_at
               ON note_tombstones(deleted_at DESC);",
        ),
        M::up(
            "CREATE TABLE note_conflicts (
               sync_event_id TEXT PRIMARY KEY,
               note_id TEXT NOT NULL,
               op TEXT NOT NULL CHECK (op IN ('put', 'del')),
               device_id TEXT NOT NULL,
               vector_clock TEXT NOT NULL DEFAULT '{}',
               title TEXT,
               markdown TEXT,
               modified_at INTEGER NOT NULL,
               edited_at INTEGER,
               deleted_at INTEGER,
               archived_at INTEGER,
               pinned_at INTEGER,
               readonly INTEGER NOT NULL DEFAULT 0 CHECK (readonly IN (0, 1)),
               created_at INTEGER NOT NULL
             );
             CREATE INDEX idx_note_conflicts_note_id
               ON note_conflicts(note_id, modified_at DESC);",
        ),
    ])
}
