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
         );
         CREATE TABLE IF NOT EXISTS mcp_notebook_access (
           principal          TEXT NOT NULL,
           account_public_key TEXT NOT NULL REFERENCES accounts(public_key) ON DELETE CASCADE ON UPDATE CASCADE,
           notebook_id        TEXT NOT NULL,
           created_at         INTEGER NOT NULL,
           PRIMARY KEY (principal, account_public_key, notebook_id)
         );
         CREATE INDEX IF NOT EXISTS idx_mcp_notebook_access_lookup
           ON mcp_notebook_access(account_public_key, principal);",
    )])
}

pub fn account_migrations() -> Migrations<'static> {
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
               updated_at INTEGER NOT NULL,
               sync_event_id TEXT,
               locally_modified INTEGER NOT NULL DEFAULT 0
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
             CREATE INDEX idx_notes_active_notebook ON notes(notebook_id)
               WHERE archived_at IS NULL;
             CREATE INDEX idx_notes_archived_at ON notes(archived_at);
             CREATE INDEX idx_notes_pinned_at ON notes(pinned_at DESC);
             CREATE INDEX idx_notes_deleted_at ON notes(deleted_at);
             CREATE INDEX idx_note_tags_tag ON note_tags(tag);",
        ),
        M::up(
            "ALTER TABLE notes ADD COLUMN current_rev TEXT;
             ALTER TABLE notebooks ADD COLUMN current_rev TEXT;
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
             CREATE INDEX idx_sync_revisions_scope ON sync_revisions(recipient, d_tag);
             CREATE INDEX idx_sync_revisions_rev ON sync_revisions(rev);
             CREATE INDEX idx_sync_revisions_mtime ON sync_revisions(mtime DESC);
             CREATE INDEX idx_sync_revision_parents_rev ON sync_revision_parents(recipient, d_tag, rev);
             CREATE INDEX idx_sync_revision_parents_parent_rev ON sync_revision_parents(recipient, d_tag, parent_rev);
             CREATE INDEX idx_sync_heads_scope ON sync_heads(recipient, d_tag);
             CREATE INDEX idx_sync_heads_mtime ON sync_heads(mtime DESC);",
        ),
        M::up("ALTER TABLE blob_uploads RENAME COLUMN hash TO object_hash;"),
        M::up("DELETE FROM app_settings WHERE key = 'sync_checkpoint';"),
    ])
}
