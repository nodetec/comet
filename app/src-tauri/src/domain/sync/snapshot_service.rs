use crate::adapters::nostr::comet_note_snapshot::{
    build_note_snapshot_event, NoteSnapshotAttachment, NoteSnapshotEventMeta, NoteSnapshotPayload,
    COMET_NOTE_COLLECTION,
};
use crate::adapters::sqlite::snapshot_repository::{
    upsert_note_snapshot_history, upsert_sync_snapshot, LocalNoteSnapshotHistoryEntry,
    LocalSyncSnapshot,
};
use crate::domain::blob::service::extract_attachment_hashes;
use crate::domain::common::text::title_from_markdown;
use crate::domain::sync::vector_clock::{
    increment_vector_clock, parse_vector_clock, serialize_vector_clock, VectorClock,
};
use crate::error::AppError;
use nostr_sdk::prelude::*;
use rusqlite::{params, Connection, OptionalExtension};

pub struct PendingNoteSnapshot {
    pub author_pubkey: String,
    pub document_coord: String,
    pub event_id: String,
    pub mtime: i64,
    pub event: Event,
    pub op: String,
    pub history: LocalNoteSnapshotHistoryEntry,
}

pub struct PendingDeletionSnapshot {
    pub author_pubkey: String,
    pub document_coord: String,
    pub event_id: String,
    pub mtime: i64,
    pub event: Event,
    pub op: String,
    pub entity_type: String,
    pub history: LocalNoteSnapshotHistoryEntry,
}

struct NoteSnapshotFields {
    markdown: String,
    created_at: i64,
    modified_at: i64,
    last_edit_device_id: Option<String>,
    vector_clock: String,
    edited_at: i64,
    archived_at: Option<i64>,
    readonly: bool,
    pinned_at: Option<i64>,
    snapshot_event_id: Option<String>,
}

struct NoteDeletionFields {
    deleted_at: i64,
    last_edit_device_id: Option<String>,
    vector_clock: String,
}

fn load_note_snapshot_fields(
    conn: &Connection,
    note_id: &str,
) -> Result<NoteSnapshotFields, AppError> {
    let row: Option<(
        String,
        i64,
        i64,
        Option<String>,
        String,
        Option<i64>,
        Option<i64>,
        bool,
        Option<i64>,
        Option<String>,
    )> = conn
        .query_row(
            "SELECT markdown, created_at, modified_at, last_edit_device_id, vector_clock, edited_at, archived_at, readonly, pinned_at, snapshot_event_id
             FROM notes
             WHERE id = ?1",
            params![note_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                    row.get::<_, i64>(7)? != 0,
                    row.get(8)?,
                    row.get(9)?,
                ))
            },
        )
        .optional()?;

    let (
        markdown,
        created_at,
        modified_at,
        last_edit_device_id,
        vector_clock,
        edited_at,
        archived_at,
        readonly,
        pinned_at,
        snapshot_event_id,
    ) = row.ok_or_else(|| AppError::custom(format!("Note not found: {note_id}")))?;

    Ok(NoteSnapshotFields {
        markdown,
        created_at,
        modified_at,
        last_edit_device_id,
        vector_clock,
        edited_at: edited_at.unwrap_or(modified_at),
        archived_at,
        readonly,
        pinned_at,
        snapshot_event_id,
    })
}

fn note_snapshot_clock(
    fields: &NoteSnapshotFields,
    fallback_device_id: &str,
) -> Result<(String, VectorClock), AppError> {
    let device_id = fields
        .last_edit_device_id
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| fallback_device_id.to_string());
    let vector_clock = parse_vector_clock(&fields.vector_clock)
        .or_else(|_| increment_vector_clock(&VectorClock::new(), &device_id))
        .map_err(AppError::custom)?;
    Ok((device_id, vector_clock))
}

fn load_note_deletion_fields(
    conn: &Connection,
    note_id: &str,
    now: i64,
) -> Result<NoteDeletionFields, AppError> {
    let note_row: Option<(Option<i64>, Option<String>, String)> = conn
        .query_row(
            "SELECT deleted_at, last_edit_device_id, vector_clock
             FROM notes
             WHERE id = ?1",
            params![note_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?;

    if let Some((deleted_at, last_edit_device_id, vector_clock)) = note_row {
        return Ok(NoteDeletionFields {
            deleted_at: deleted_at.unwrap_or(now),
            last_edit_device_id,
            vector_clock,
        });
    }

    let tombstone_row: Option<(i64, String, String)> = conn
        .query_row(
            "SELECT deleted_at, last_edit_device_id, vector_clock
             FROM note_tombstones
             WHERE id = ?1",
            params![note_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?;

    let Some((deleted_at, last_edit_device_id, vector_clock)) = tombstone_row else {
        return Err(AppError::custom(format!(
            "Note or tombstone not found: {note_id}"
        )));
    };

    Ok(NoteDeletionFields {
        deleted_at,
        last_edit_device_id: Some(last_edit_device_id),
        vector_clock,
    })
}

fn load_direct_tag_paths(conn: &Connection, note_id: &str) -> Result<Vec<String>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT t.path
         FROM note_tag_links l
         JOIN tags t ON t.id = l.tag_id
         WHERE l.note_id = ?1 AND l.is_direct = 1
         ORDER BY t.path ASC",
    )?;
    let rows = stmt.query_map(params![note_id], |row| row.get(0))?;
    rows.collect::<Result<Vec<String>, _>>().map_err(Into::into)
}

fn load_blob_attachments(
    conn: &Connection,
    markdown: &str,
    author_pubkey_hex: &str,
) -> Result<Vec<NoteSnapshotAttachment>, AppError> {
    let preferred_blossom_url: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'blossom_url'",
            [],
            |row| row.get(0),
        )
        .optional()?;

    let mut blob_attachments = Vec::new();
    let mut seen_hashes = std::collections::HashSet::new();
    for hash in extract_attachment_hashes(markdown) {
        if !seen_hashes.insert(hash.clone()) {
            continue;
        }

        let meta: Option<(String, String)> = if let Some(ref blossom_url) = preferred_blossom_url {
            conn.query_row(
                "SELECT ciphertext_hash, encryption_key
                 FROM blob_meta
                 WHERE plaintext_hash = ?1 AND pubkey = ?2
                 ORDER BY CASE WHEN server_url = ?3 THEN 0 ELSE 1 END, rowid DESC
                 LIMIT 1",
                params![hash, author_pubkey_hex, blossom_url],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?
        } else {
            conn.query_row(
                "SELECT ciphertext_hash, encryption_key
                 FROM blob_meta
                 WHERE plaintext_hash = ?1 AND pubkey = ?2
                 ORDER BY rowid DESC
                 LIMIT 1",
                params![hash, author_pubkey_hex],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?
        };

        if let Some((ciphertext_hash, key_hex)) = meta {
            blob_attachments.push(NoteSnapshotAttachment {
                plaintext_hash: hash,
                ciphertext_hash,
                key: key_hex,
            });
        } else if preferred_blossom_url.is_some() {
            return Err(AppError::custom(format!(
                "Missing encrypted blob metadata for attachment: {hash}"
            )));
        }
    }

    Ok(blob_attachments)
}

pub fn build_pending_note_snapshot(
    conn: &Connection,
    keys: &Keys,
    _author_pubkey: &PublicKey,
    note_id: &str,
) -> Result<PendingNoteSnapshot, AppError> {
    let fields = load_note_snapshot_fields(conn, note_id)?;

    let author_pubkey = keys.public_key().to_hex();
    let (device_id, vector_clock) = note_snapshot_clock(&fields, &author_pubkey)?;
    let document_coord = note_id.to_string();
    let direct_tag_paths = load_direct_tag_paths(conn, note_id)?;
    let attachments = load_blob_attachments(conn, &fields.markdown, &author_pubkey)?;
    let payload = NoteSnapshotPayload {
        version: 1,
        device_id,
        vector_clock,
        markdown: fields.markdown.clone(),
        note_created_at: fields.created_at,
        edited_at: fields.edited_at,
        deleted_at: None,
        archived_at: fields.archived_at,
        pinned_at: fields.pinned_at,
        readonly: fields.readonly,
        tags: direct_tag_paths,
        attachments,
    };
    let event = build_note_snapshot_event(
        keys,
        &NoteSnapshotEventMeta {
            document_id: document_coord.clone(),
            operation: "put".to_string(),
            collection: Some(COMET_NOTE_COLLECTION.to_string()),
            created_at_ms: Some(fields.modified_at),
        },
        Some(&payload),
    )?;
    let event_id = event.id.to_hex();

    Ok(PendingNoteSnapshot {
        author_pubkey,
        document_coord,
        event_id: event_id.clone(),
        mtime: fields.modified_at,
        event,
        op: "put".to_string(),
        history: LocalNoteSnapshotHistoryEntry {
            snapshot_event_id: event_id.clone(),
            note_id: note_id.to_string(),
            op: "put".to_string(),
            device_id: payload.device_id.clone(),
            vector_clock: serialize_vector_clock(&payload.vector_clock)
                .map_err(AppError::custom)?,
            title: Some(title_from_markdown(&payload.markdown)),
            markdown: Some(payload.markdown.clone()),
            modified_at: fields.modified_at,
            edited_at: Some(payload.edited_at),
            deleted_at: payload.deleted_at,
            archived_at: payload.archived_at,
            pinned_at: payload.pinned_at,
            readonly: payload.readonly,
            created_at: fields.modified_at,
        },
    })
}

pub fn build_materialized_note_snapshot_for_publish(
    conn: &Connection,
    keys: &Keys,
    _author_pubkey: &PublicKey,
    note_id: &str,
) -> Result<Option<PendingNoteSnapshot>, AppError> {
    let fields = load_note_snapshot_fields(conn, note_id)?;
    if fields.snapshot_event_id.is_some() {
        return Ok(None);
    }
    drop(fields);
    build_pending_note_snapshot(conn, keys, _author_pubkey, note_id).map(Some)
}

pub fn materialize_note_snapshot_locally(
    conn: &Connection,
    keys: &Keys,
    author_pubkey: &PublicKey,
    note_id: &str,
    mark_locally_modified: bool,
) -> Result<String, AppError> {
    let pending = build_pending_note_snapshot(conn, keys, author_pubkey, note_id)?;
    let event_id = pending.event_id.clone();
    persist_local_note_snapshot(conn, &pending)?;
    conn.execute(
        "UPDATE notes
         SET locally_modified = CASE
               WHEN ?2 = 1 AND snapshot_event_id IS NULL THEN 1
               ELSE locally_modified
             END
         WHERE id = ?1",
        params![note_id, i32::from(mark_locally_modified)],
    )?;

    Ok(event_id)
}

pub fn persist_local_note_snapshot(
    conn: &Connection,
    snapshot: &PendingNoteSnapshot,
) -> Result<(), AppError> {
    upsert_note_snapshot_history(conn, &snapshot.history)?;
    upsert_sync_snapshot(
        conn,
        &LocalSyncSnapshot {
            author_pubkey: snapshot.author_pubkey.clone(),
            d_tag: snapshot.document_coord.clone(),
            snapshot_id: snapshot.event_id.clone(),
            op: snapshot.op.clone(),
            mtime: snapshot.mtime,
            entity_type: Some("note".to_string()),
            event_id: Some(snapshot.event_id.clone()),
            payload_retained: true,
            relay_url: None,
            stored_seq: None,
            created_at: snapshot.mtime.div_euclid(1000),
        },
    )?;

    Ok(())
}

pub fn build_pending_note_deletion_snapshot(
    conn: &Connection,
    keys: &Keys,
    _author_pubkey: &PublicKey,
    note_id: &str,
    now: i64,
) -> Result<PendingDeletionSnapshot, AppError> {
    let deletion_fields = load_note_deletion_fields(conn, note_id, now)?;
    let author_pubkey = keys.public_key().to_hex();
    let document_coord = note_id.to_string();
    let device_id = deletion_fields
        .last_edit_device_id
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| author_pubkey.clone());
    let vector_clock =
        parse_vector_clock(&deletion_fields.vector_clock).map_err(AppError::custom)?;
    let payload = NoteSnapshotPayload {
        version: 1,
        device_id,
        vector_clock,
        markdown: String::new(),
        note_created_at: 0,
        edited_at: deletion_fields.deleted_at,
        deleted_at: Some(deletion_fields.deleted_at),
        archived_at: None,
        pinned_at: None,
        readonly: false,
        tags: vec![],
        attachments: vec![],
    };
    let event = build_note_snapshot_event(
        keys,
        &NoteSnapshotEventMeta {
            document_id: document_coord.clone(),
            operation: "del".to_string(),
            collection: Some(COMET_NOTE_COLLECTION.to_string()),
            created_at_ms: Some(now),
        },
        Some(&payload),
    )?;
    let event_id = event.id.to_hex();

    Ok(PendingDeletionSnapshot {
        author_pubkey,
        document_coord,
        event_id: event_id.clone(),
        mtime: now,
        event,
        op: "del".to_string(),
        entity_type: "note".to_string(),
        history: LocalNoteSnapshotHistoryEntry {
            snapshot_event_id: event_id.clone(),
            note_id: note_id.to_string(),
            op: "del".to_string(),
            device_id: payload.device_id.clone(),
            vector_clock: serialize_vector_clock(&payload.vector_clock)
                .map_err(AppError::custom)?,
            title: None,
            markdown: None,
            modified_at: now,
            edited_at: Some(payload.edited_at),
            deleted_at: payload.deleted_at,
            archived_at: None,
            pinned_at: None,
            readonly: false,
            created_at: now,
        },
    })
}

pub fn persist_local_deletion_snapshot(
    conn: &Connection,
    snapshot: &PendingDeletionSnapshot,
) -> Result<(), AppError> {
    upsert_note_snapshot_history(conn, &snapshot.history)?;
    upsert_sync_snapshot(
        conn,
        &LocalSyncSnapshot {
            author_pubkey: snapshot.author_pubkey.clone(),
            d_tag: snapshot.document_coord.clone(),
            snapshot_id: snapshot.event_id.clone(),
            op: snapshot.op.clone(),
            mtime: snapshot.mtime,
            entity_type: Some(snapshot.entity_type.clone()),
            event_id: Some(snapshot.event_id.clone()),
            payload_retained: true,
            relay_url: None,
            stored_seq: None,
            created_at: snapshot.mtime.div_euclid(1000),
        },
    )?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::sqlite::migrations::account_migrations;
    use rusqlite::Connection;

    fn setup_db() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        account_migrations().to_latest(&mut conn).unwrap();
        conn.execute(
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at, locally_modified)
             VALUES ('note-1', 'Title', '# Title\n\n#alpha #beta', 100, 200, 200, 1)",
            [],
        )
        .unwrap();
        crate::adapters::sqlite::tag_index::ensure_tag_index_ready(&mut conn).unwrap();
        conn
    }

    #[test]
    fn builds_stable_pending_note_snapshot() {
        let conn = setup_db();
        let keys = Keys::generate();
        let author_pubkey = keys.public_key();

        let snapshot = build_pending_note_snapshot(&conn, &keys, &author_pubkey, "note-1").unwrap();
        let snapshot_again =
            build_pending_note_snapshot(&conn, &keys, &author_pubkey, "note-1").unwrap();

        assert_eq!(snapshot.document_coord, snapshot_again.document_coord);
        assert_eq!(snapshot.author_pubkey, author_pubkey.to_hex());
        assert_eq!(snapshot.document_coord, "note-1");
        assert_eq!(snapshot.event_id, snapshot.event.id.to_hex());
        assert_eq!(snapshot_again.event_id, snapshot_again.event.id.to_hex());
        assert_ne!(snapshot.event_id, snapshot_again.event_id);
    }

    #[test]
    fn builds_note_snapshot_with_blob_tags_from_metadata() {
        let conn = setup_db();
        let keys = Keys::generate();
        let author_pubkey = keys.public_key();
        let hash = "a".repeat(64);
        let ciphertext_hash = "b".repeat(64);
        let key_hex = "c".repeat(64);

        conn.execute(
            "UPDATE notes SET markdown = ?1 WHERE id = 'note-1'",
            params![format!("# Title\n\n![img](attachment://{hash}.png)")],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO app_settings (key, value) VALUES ('blossom_url', 'https://blobs.example.com')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO blob_meta (plaintext_hash, server_url, pubkey, ciphertext_hash, encryption_key)
             VALUES (?1, 'https://blobs.example.com', ?2, ?3, ?4)",
            params![hash, author_pubkey.to_hex(), ciphertext_hash, key_hex],
        )
        .unwrap();

        let snapshot = build_pending_note_snapshot(&conn, &keys, &author_pubkey, "note-1").unwrap();
        let parsed = crate::adapters::nostr::comet_note_snapshot::parse_note_snapshot_event(
            &keys,
            &snapshot.event,
        )
        .unwrap();
        let payload = parsed.payload.expect("payload should be present");

        assert_eq!(payload.attachments.len(), 1);
        assert_eq!(payload.attachments[0].plaintext_hash, hash);
        assert_eq!(payload.attachments[0].ciphertext_hash, ciphertext_hash);
        assert_eq!(payload.attachments[0].key, key_hex);
    }

    #[test]
    fn persists_local_snapshot_in_sync_store() {
        let conn = setup_db();
        let keys = Keys::generate();
        let author_pubkey = keys.public_key();

        let snapshot = build_pending_note_snapshot(&conn, &keys, &author_pubkey, "note-1").unwrap();
        persist_local_note_snapshot(&conn, &snapshot).unwrap();

        let stored_snapshot_id: String = conn
            .query_row(
                "SELECT snapshot_id FROM sync_snapshots WHERE author_pubkey = ?1 AND d_tag = 'note-1'",
                params![author_pubkey.to_hex()],
                |row| row.get(0),
            )
            .unwrap();
        let stored_markdown: Option<String> = conn
            .query_row(
                "SELECT markdown FROM note_snapshot_history WHERE snapshot_event_id = ?1",
                params![snapshot.event_id],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(stored_snapshot_id, snapshot.event_id);
        assert_eq!(stored_markdown.as_deref(), Some("# Title\n\n#alpha #beta"));
    }

    #[test]
    fn builds_note_deletion_snapshot() {
        let conn = setup_db();
        let keys = Keys::generate();
        let author_pubkey = keys.public_key();

        let snapshot =
            build_pending_note_deletion_snapshot(&conn, &keys, &author_pubkey, "note-1", 300)
                .unwrap();

        assert!(!snapshot.event_id.is_empty());
        assert_eq!(snapshot.op, "del");
        assert_eq!(snapshot.entity_type, "note");
        assert!(!snapshot.event.content.is_empty());
    }
}
