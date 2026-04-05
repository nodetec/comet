use crate::adapters::nostr::comet_note_snapshot::{
    parse_note_snapshot_event, payload_to_synced_note, payload_to_synced_tombstone,
};
use crate::adapters::sqlite::snapshot_repository::{
    get_sync_relay_state, upsert_note_snapshot_history, upsert_sync_relay_state,
    upsert_sync_snapshot, LocalSyncSnapshot,
};
use crate::domain::sync::history_entry::{
    note_snapshot_history_entry, tombstone_snapshot_history_entry,
};
use crate::domain::sync::model::SyncChangePayload;
use crate::domain::sync::service::{upsert_from_sync, upsert_tombstone_from_sync};
use crate::error::AppError;
use nostr_sdk::prelude::*;
use rusqlite::{params, Connection, OptionalExtension};

pub fn apply_remote_snapshot_event(
    conn: &Connection,
    relay_url: &str,
    keys: &Keys,
    event: &Event,
    stored_seq: Option<i64>,
    mut invalidate_cache: impl FnMut(&str),
) -> Result<Option<SyncChangePayload>, AppError> {
    let parsed = parse_note_snapshot_event(keys, event)?;
    let author_pubkey = event.pubkey.to_hex();
    let snapshot_timestamp_ms = event.created_at.as_secs() as i64 * 1000;
    let preferred_blossom_url: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'blossom_url'",
            [],
            |row| row.get(0),
        )
        .optional()?;

    let change_payload = if parsed.operation == "del" {
        let payload = parsed
            .payload
            .as_ref()
            .ok_or_else(|| AppError::custom("Delete note snapshot event is missing payload"))?;
        let tombstone = payload_to_synced_tombstone(&parsed.document_id, payload)?;

        upsert_note_snapshot_history(
            conn,
            &tombstone_snapshot_history_entry(
                &event.id.to_hex(),
                &tombstone,
                snapshot_timestamp_ms,
            )?,
        )?;
        upsert_sync_snapshot(
            conn,
            &LocalSyncSnapshot {
                author_pubkey: author_pubkey.clone(),
                d_tag: parsed.document_id.clone(),
                snapshot_id: event.id.to_hex(),
                op: parsed.operation.clone(),
                mtime: snapshot_timestamp_ms,
                entity_type: Some("note".to_string()),
                event_id: Some(event.id.to_hex()),
                payload_retained: true,
                relay_url: Some(relay_url.to_string()),
                stored_seq,
                created_at: event.created_at.as_secs() as i64,
            },
        )?;
        let updated =
            upsert_tombstone_from_sync(conn, &tombstone, &event.id.to_hex(), |note_id| {
                invalidate_cache(note_id)
            })?;
        if let Some(note_id) = updated {
            let conflict_count: i64 = conn.query_row(
                "SELECT COUNT(*) FROM note_conflicts WHERE note_id = ?1",
                params![note_id],
                |row| row.get(0),
            )?;
            Some(SyncChangePayload {
                note_id,
                action: if conflict_count > 0 {
                    "conflict".to_string()
                } else {
                    "delete".to_string()
                },
            })
        } else {
            None
        }
    } else {
        let payload = parsed
            .payload
            .as_ref()
            .ok_or_else(|| AppError::custom("Put note snapshot event is missing payload"))?;

        if let Some(ref blossom_url) = preferred_blossom_url {
            for attachment in &payload.attachments {
                conn.execute(
                    "INSERT OR REPLACE INTO blob_meta (plaintext_hash, server_url, pubkey, ciphertext_hash, encryption_key)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![
                        attachment.plaintext_hash,
                        blossom_url,
                        &author_pubkey,
                        attachment.ciphertext_hash,
                        attachment.key
                    ],
                )?;
            }
        }

        let note = payload_to_synced_note(&parsed.document_id, snapshot_timestamp_ms, payload);
        let note_id = note.id.clone();
        upsert_note_snapshot_history(
            conn,
            &note_snapshot_history_entry(&event.id.to_hex(), &note, snapshot_timestamp_ms)?,
        )?;
        let updated = upsert_from_sync(conn, &note, &event.id.to_hex())?;

        upsert_sync_snapshot(
            conn,
            &LocalSyncSnapshot {
                author_pubkey: author_pubkey.clone(),
                d_tag: parsed.document_id.clone(),
                snapshot_id: event.id.to_hex(),
                op: parsed.operation.clone(),
                mtime: snapshot_timestamp_ms,
                entity_type: Some("note".to_string()),
                event_id: Some(event.id.to_hex()),
                payload_retained: true,
                relay_url: Some(relay_url.to_string()),
                stored_seq,
                created_at: event.created_at.as_secs() as i64,
            },
        )?;

        let conflict_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM note_conflicts WHERE note_id = ?1",
            params![note_id],
            |row| row.get(0),
        )?;
        if updated.is_some() || conflict_count > 0 {
            invalidate_cache(&note_id);
            Some(SyncChangePayload {
                note_id,
                action: if conflict_count > 0 {
                    "conflict".to_string()
                } else {
                    "upsert".to_string()
                },
            })
        } else {
            None
        }
    };

    if let Some(stored_seq) = stored_seq {
        let state = get_sync_relay_state(conn, relay_url)?;
        let min_payload_mtime = state.as_ref().and_then(|state| state.min_payload_mtime);
        let snapshot_seq = state.as_ref().and_then(|state| state.snapshot_seq);
        upsert_sync_relay_state(
            conn,
            relay_url,
            Some(stored_seq),
            snapshot_seq,
            Some(crate::domain::common::time::now_millis()),
            min_payload_mtime,
        )?;
    }

    Ok(change_payload)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::nostr::comet_note_snapshot::{
        build_note_snapshot_event, NoteSnapshotAttachment, NoteSnapshotEventMeta,
        NoteSnapshotPayload, COMET_NOTE_COLLECTION,
    };
    use crate::adapters::sqlite::migrations::account_migrations;
    use rusqlite::Connection;

    fn setup_db() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        account_migrations().to_latest(&mut conn).unwrap();
        conn
    }

    fn make_put_event(
        keys: &Keys,
        note_id: &str,
        markdown: &str,
        note_created_at: i64,
        edited_at: i64,
        archived_at: Option<i64>,
        pinned_at: Option<i64>,
        readonly: bool,
        tags: Vec<String>,
        attachments: Vec<NoteSnapshotAttachment>,
        created_at_ms: i64,
    ) -> Event {
        let payload = NoteSnapshotPayload {
            version: 1,
            device_id: "DEVICE-A".to_string(),
            vector_clock: std::collections::BTreeMap::from([(
                "DEVICE-A".to_string(),
                created_at_ms as u64,
            )]),
            markdown: markdown.to_string(),
            note_created_at,
            edited_at,
            deleted_at: None,
            archived_at,
            pinned_at,
            readonly,
            tags,
            attachments,
        };
        build_note_snapshot_event(
            keys,
            &NoteSnapshotEventMeta {
                document_id: note_id.to_string(),
                operation: "put".to_string(),
                collection: Some(COMET_NOTE_COLLECTION.to_string()),
                created_at_ms: Some(created_at_ms),
            },
            Some(&payload),
        )
        .unwrap()
    }

    fn make_delete_event(keys: &Keys, note_id: &str, created_at_ms: i64) -> Event {
        let payload = NoteSnapshotPayload {
            version: 1,
            device_id: "DEVICE-A".to_string(),
            vector_clock: std::collections::BTreeMap::from([(
                "DEVICE-A".to_string(),
                created_at_ms as u64,
            )]),
            markdown: String::new(),
            note_created_at: 0,
            edited_at: created_at_ms,
            deleted_at: Some(created_at_ms),
            archived_at: None,
            pinned_at: None,
            readonly: false,
            tags: vec![],
            attachments: vec![],
        };
        build_note_snapshot_event(
            keys,
            &NoteSnapshotEventMeta {
                document_id: note_id.to_string(),
                operation: "del".to_string(),
                collection: Some(COMET_NOTE_COLLECTION.to_string()),
                created_at_ms: Some(created_at_ms),
            },
            Some(&payload),
        )
        .unwrap()
    }

    #[test]
    fn applies_remote_note_snapshot_and_updates_snapshot_event_id() {
        let conn = setup_db();
        let keys = Keys::generate();
        let note_id = "note-1";
        let event = make_put_event(
            &keys,
            note_id,
            "# Title\n\nBody",
            100,
            200,
            None,
            None,
            false,
            vec![],
            vec![],
            200,
        );

        let change = apply_remote_snapshot_event(
            &conn,
            "wss://relay.example",
            &keys,
            &event,
            Some(7),
            |_| {},
        )
        .unwrap();

        let snapshot_event_id: Option<String> = conn
            .query_row(
                "SELECT snapshot_event_id FROM notes WHERE id = 'note-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(snapshot_event_id, Some(event.id.to_hex()));
        assert_eq!(
            change.map(|payload| (payload.note_id, payload.action)),
            Some(("note-1".to_string(), "upsert".to_string()))
        );
    }

    #[test]
    fn live_apply_advances_checkpoint_without_overwriting_snapshot_seq() {
        let conn = setup_db();
        let keys = Keys::generate();
        let relay_url = "wss://relay.example";
        let note_id = "note-1";

        upsert_sync_relay_state(&conn, relay_url, None, Some(12), Some(1000), Some(500)).unwrap();

        let event = make_put_event(
            &keys,
            note_id,
            "# Title\n\nBody",
            100,
            200,
            None,
            None,
            false,
            vec![],
            vec![],
            200,
        );

        apply_remote_snapshot_event(&conn, relay_url, &keys, &event, Some(20), |_| {}).unwrap();

        let state = get_sync_relay_state(&conn, relay_url).unwrap().unwrap();
        assert_eq!(state.snapshot_seq, Some(12));
        assert_eq!(state.checkpoint_seq, Some(20));
        assert_eq!(state.min_payload_mtime, Some(500));
    }

    #[test]
    fn applies_remote_note_snapshot_persists_blob_metadata() {
        let conn = setup_db();
        let keys = Keys::generate();
        let note_id = "note-blob";
        let hash = "a".repeat(64);
        let ciphertext_hash = "b".repeat(64);
        let key_hex = "c".repeat(64);

        conn.execute(
            "INSERT INTO app_settings (key, value) VALUES ('blossom_url', 'https://blobs.example.com')",
            [],
        )
        .unwrap();

        let markdown = format!("# Title\n\n![img](attachment://{hash}.png)");
        let event = make_put_event(
            &keys,
            note_id,
            &markdown,
            100,
            200,
            None,
            None,
            false,
            vec![],
            vec![NoteSnapshotAttachment {
                plaintext_hash: hash.clone(),
                ciphertext_hash: ciphertext_hash.clone(),
                key: key_hex.clone(),
            }],
            200,
        );

        let change = apply_remote_snapshot_event(
            &conn,
            "ws://relay.example",
            &keys,
            &event,
            Some(1),
            |_| {},
        )
        .unwrap();

        let stored: Option<(String, String, String)> = conn
            .query_row(
                "SELECT server_url, ciphertext_hash, encryption_key
                 FROM blob_meta
                 WHERE plaintext_hash = ?1 AND pubkey = ?2",
                params![hash, keys.public_key().to_hex()],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()
            .unwrap();

        assert_eq!(
            stored,
            Some((
                "https://blobs.example.com".to_string(),
                ciphertext_hash,
                key_hex,
            ))
        );
        assert_eq!(
            change.map(|payload| (payload.note_id, payload.action)),
            Some(("note-blob".to_string(), "upsert".to_string()))
        );
    }

    #[test]
    fn applies_remote_note_snapshot_uses_event_created_at_as_modified_at() {
        let conn = setup_db();
        let keys = Keys::generate();
        let note_id = "note-bad-mtime";
        let event = make_put_event(
            &keys,
            note_id,
            "# Title\n\nBody",
            100,
            200,
            None,
            None,
            false,
            vec![],
            vec![],
            201,
        );

        let change = apply_remote_snapshot_event(
            &conn,
            "wss://relay.example",
            &keys,
            &event,
            Some(7),
            |_| {},
        )
        .unwrap();

        let (snapshot_event_id, modified_at): (Option<String>, i64) = conn
            .query_row(
                "SELECT snapshot_event_id, modified_at FROM notes WHERE id = ?1",
                params![note_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();

        assert_eq!(snapshot_event_id, Some(event.id.to_hex()));
        assert_eq!(modified_at, 0);
        assert_eq!(
            change.map(|payload| (payload.note_id, payload.action)),
            Some((note_id.to_string(), "upsert".to_string()))
        );
    }

    #[test]
    fn applies_remote_note_deletion_snapshot() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at)
             VALUES ('note-1', 'Title', '# Title\\n\\nBody', 100, 200, 200)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO notes_fts (note_id, title, markdown)
             VALUES ('note-1', 'Title', '# Title\\n\\nBody')",
            [],
        )
        .unwrap();

        let keys = Keys::generate();
        let author_pubkey = keys.public_key();
        let event = make_delete_event(&keys, "note-1", 300);

        apply_remote_snapshot_event(&conn, "wss://relay.example", &keys, &event, Some(8), |_| {})
            .unwrap();

        let remaining: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM notes WHERE id = 'note-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(remaining, 0);
        let tombstones: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM note_tombstones WHERE id = 'note-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(tombstones, 1);
        let stored_op: String = conn
            .query_row(
                "SELECT op FROM sync_snapshots WHERE author_pubkey = ?1 AND d_tag = ?2 ORDER BY created_at DESC LIMIT 1",
                params![author_pubkey.to_hex(), "note-1"],
                |row| row.get(0),
            )
            .unwrap();
        let stored_deleted_at: Option<i64> = conn
            .query_row(
                "SELECT deleted_at FROM note_snapshot_history WHERE snapshot_event_id = ?1",
                params![event.id.to_hex()],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(stored_op, "del");
        assert_eq!(stored_deleted_at, Some(300));
    }
}
