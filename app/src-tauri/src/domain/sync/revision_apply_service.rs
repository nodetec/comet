use crate::adapters::nostr::comet_note_revision::{
    parse_note_revision_event, payload_to_synced_note,
};
use crate::adapters::sqlite::revision_sync_repository::{
    apply_sync_head_update, get_sync_relay_state, list_sync_heads_for_scope,
    replace_sync_revision_parents, upsert_sync_relay_state, upsert_sync_revision,
    LocalSyncRevision,
};
use crate::domain::sync::model::SyncChangePayload;
use crate::domain::sync::service::{delete_note_from_sync, upsert_from_sync};
use crate::error::AppError;
use nostr_sdk::prelude::*;
use rusqlite::{params, Connection, OptionalExtension};

pub fn apply_remote_revision_event(
    conn: &Connection,
    relay_url: &str,
    keys: &Keys,
    event: &Event,
    stored_seq: Option<i64>,
    mut invalidate_cache: impl FnMut(&str),
) -> Result<Option<SyncChangePayload>, AppError> {
    let parsed = parse_note_revision_event(keys, event)?;
    let author_pubkey = event.pubkey.to_hex();
    let revision_timestamp_ms = event.created_at.as_secs() as i64 * 1000;
    let preferred_blossom_url: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'blossom_url'",
            [],
            |row| row.get(0),
        )
        .optional()?;

    let change_payload = if parsed.operation == "del" {
        let entity_id = parsed.document_id.clone();

        upsert_sync_revision(
            conn,
            &LocalSyncRevision {
                author_pubkey: author_pubkey.clone(),
                d_tag: parsed.document_id.clone(),
                rev: parsed.revision_id.clone(),
                op: parsed.operation.clone(),
                mtime: revision_timestamp_ms,
                entity_type: Some("note".to_string()),
                payload_event_id: Some(event.id.to_hex()),
                payload_retained: true,
                relay_url: Some(relay_url.to_string()),
                stored_seq,
                created_at: event.created_at.as_secs() as i64,
            },
        )?;
        replace_sync_revision_parents(
            conn,
            &author_pubkey,
            &parsed.document_id,
            &parsed.revision_id,
            &parsed.parent_revision_ids,
        )?;
        apply_sync_head_update(
            conn,
            &author_pubkey,
            &parsed.document_id,
            &parsed.revision_id,
            &parsed.operation,
            revision_timestamp_ms,
            &parsed.parent_revision_ids,
        )?;
        let remaining_heads = list_sync_heads_for_scope(conn, &author_pubkey, &parsed.document_id)?;
        let has_content_head = remaining_heads.iter().any(|head| head.op == "put");
        if has_content_head {
            None
        } else {
            delete_note_from_sync(conn, &entity_id, |note_id| invalidate_cache(note_id))?;
            Some(SyncChangePayload {
                note_id: entity_id,
                action: "delete".to_string(),
            })
        }
    } else {
        let payload = parsed
            .payload
            .as_ref()
            .ok_or_else(|| AppError::custom("Put note revision event is missing payload"))?;

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

        let note = payload_to_synced_note(&parsed.document_id, revision_timestamp_ms, payload);
        let note_id = note.id.clone();
        let updated = upsert_from_sync(conn, &note, &event.id.to_hex())?;

        upsert_sync_revision(
            conn,
            &LocalSyncRevision {
                author_pubkey: author_pubkey.clone(),
                d_tag: parsed.document_id.clone(),
                rev: parsed.revision_id.clone(),
                op: parsed.operation.clone(),
                mtime: revision_timestamp_ms,
                entity_type: Some("note".to_string()),
                payload_event_id: Some(event.id.to_hex()),
                payload_retained: true,
                relay_url: Some(relay_url.to_string()),
                stored_seq,
                created_at: event.created_at.as_secs() as i64,
            },
        )?;
        replace_sync_revision_parents(
            conn,
            &author_pubkey,
            &parsed.document_id,
            &parsed.revision_id,
            &parsed.parent_revision_ids,
        )?;
        apply_sync_head_update(
            conn,
            &author_pubkey,
            &parsed.document_id,
            &parsed.revision_id,
            &parsed.operation,
            revision_timestamp_ms,
            &parsed.parent_revision_ids,
        )?;

        if updated.is_some() {
            conn.execute(
                "UPDATE notes SET current_rev = ?1 WHERE id = ?2",
                params![parsed.revision_id, note_id],
            )?;
            invalidate_cache(&note_id);
            Some(SyncChangePayload {
                note_id,
                action: "upsert".to_string(),
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
    use crate::adapters::nostr::comet_note_revision::{
        build_note_revision_event, compute_note_revision_id, NoteRevisionAttachment,
        NoteRevisionEventMeta, NoteRevisionPayload, COMET_NOTE_COLLECTION,
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
        attachments: Vec<NoteRevisionAttachment>,
        parent_revision_ids: Vec<String>,
        created_at_ms: i64,
    ) -> (Event, String) {
        let payload = NoteRevisionPayload {
            version: 1,
            markdown: markdown.to_string(),
            note_created_at,
            edited_at,
            archived_at,
            pinned_at,
            readonly,
            tags,
            attachments,
        };
        let revision_id = compute_note_revision_id(
            note_id,
            &parent_revision_ids,
            "put",
            Some(COMET_NOTE_COLLECTION),
            Some(&payload),
        )
        .unwrap();
        let event = build_note_revision_event(
            keys,
            &NoteRevisionEventMeta {
                document_id: note_id.to_string(),
                revision_id: revision_id.clone(),
                parent_revision_ids,
                operation: "put".to_string(),
                collection: Some(COMET_NOTE_COLLECTION.to_string()),
                created_at_ms: Some(created_at_ms),
            },
            Some(&payload),
        )
        .unwrap();
        (event, revision_id)
    }

    fn make_delete_event(
        keys: &Keys,
        note_id: &str,
        parent_revision_ids: Vec<String>,
        created_at_ms: i64,
    ) -> (Event, String) {
        let revision_id = compute_note_revision_id(
            note_id,
            &parent_revision_ids,
            "del",
            Some(COMET_NOTE_COLLECTION),
            None,
        )
        .unwrap();
        let event = build_note_revision_event(
            keys,
            &NoteRevisionEventMeta {
                document_id: note_id.to_string(),
                revision_id: revision_id.clone(),
                parent_revision_ids,
                operation: "del".to_string(),
                collection: Some(COMET_NOTE_COLLECTION.to_string()),
                created_at_ms: Some(created_at_ms),
            },
            None,
        )
        .unwrap();
        (event, revision_id)
    }

    #[test]
    fn applies_remote_note_revision_and_updates_current_rev() {
        let conn = setup_db();
        let keys = Keys::generate();
        let note_id = "note-1";
        let (event, revision_id) = make_put_event(
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
            vec![],
            200,
        );

        let change = apply_remote_revision_event(
            &conn,
            "wss://relay.example",
            &keys,
            &event,
            Some(7),
            |_| {},
        )
        .unwrap();

        let current_rev: Option<String> = conn
            .query_row(
                "SELECT current_rev FROM notes WHERE id = 'note-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(current_rev, Some(revision_id));
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

        let (event, _) = make_put_event(
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
            vec![],
            200,
        );

        apply_remote_revision_event(&conn, relay_url, &keys, &event, Some(20), |_| {}).unwrap();

        let state = get_sync_relay_state(&conn, relay_url).unwrap().unwrap();
        assert_eq!(state.snapshot_seq, Some(12));
        assert_eq!(state.checkpoint_seq, Some(20));
        assert_eq!(state.min_payload_mtime, Some(500));
    }

    #[test]
    fn applies_remote_note_revision_persists_blob_metadata() {
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
        let (event, _) = make_put_event(
            &keys,
            note_id,
            &markdown,
            100,
            200,
            None,
            None,
            false,
            vec![],
            vec![NoteRevisionAttachment {
                plaintext_hash: hash.clone(),
                ciphertext_hash: ciphertext_hash.clone(),
                key: key_hex.clone(),
            }],
            vec![],
            200,
        );

        let change = apply_remote_revision_event(
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
    fn applies_remote_note_revision_uses_event_created_at_as_modified_at() {
        let conn = setup_db();
        let keys = Keys::generate();
        let note_id = "note-bad-mtime";
        let (event, revision_id) = make_put_event(
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
            vec![],
            201,
        );

        let change = apply_remote_revision_event(
            &conn,
            "wss://relay.example",
            &keys,
            &event,
            Some(7),
            |_| {},
        )
        .unwrap();

        let (current_rev, modified_at): (Option<String>, i64) = conn
            .query_row(
                "SELECT current_rev, modified_at FROM notes WHERE id = ?1",
                params![note_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();

        assert_eq!(current_rev, Some(revision_id));
        assert_eq!(modified_at, 0);
        assert_eq!(
            change.map(|payload| (payload.note_id, payload.action)),
            Some((note_id.to_string(), "upsert".to_string()))
        );
    }

    #[test]
    fn applies_remote_note_deletion_revision() {
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
        let (event, _revision_id) = make_delete_event(&keys, "note-1", vec![], 300);

        apply_remote_revision_event(&conn, "wss://relay.example", &keys, &event, Some(8), |_| {})
            .unwrap();

        let remaining: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM notes WHERE id = 'note-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(remaining, 0);

        let head_op: String = conn
            .query_row(
                "SELECT op FROM sync_heads WHERE recipient = ?1 AND d_tag = ?2",
                params![author_pubkey.to_hex(), "note-1"],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(head_op, "del");
    }
}
