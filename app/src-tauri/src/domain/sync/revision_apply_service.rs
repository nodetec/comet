use crate::adapters::sqlite::revision_sync_repository::{
    replace_sync_heads, replace_sync_revision_parents, upsert_sync_relay_state,
    upsert_sync_revision, LocalSyncHead, LocalSyncRevision,
};
use crate::domain::sync::event_codec::{
    is_notebook_rumor, rumor_to_synced_note, rumor_to_synced_notebook,
};
use crate::domain::sync::revision_codec::parse_revision_envelope_meta;
use crate::domain::sync::model::SyncChangePayload;
use crate::domain::sync::service::{
    delete_note_from_sync, delete_notebook_from_sync, upsert_from_sync, upsert_notebook_from_sync,
};
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
    let meta = parse_revision_envelope_meta(event)?;
    let unwrapped = crate::adapters::nostr::nip59_ext::extract_rumor(keys, event)?;
    let preferred_blossom_url: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'blossom_url'",
            [],
            |row| row.get(0),
        )
        .optional()?;

    let change_payload = if meta.op == "del" {
        let entity_id = unwrapped
            .rumor
            .tags
            .find(TagKind::d())
            .and_then(|tag| tag.content())
            .ok_or_else(|| AppError::custom("Missing d tag in deletion revision rumor"))?
            .to_string();

        if is_notebook_rumor(&unwrapped.rumor) {
            delete_notebook_from_sync(conn, &entity_id)?;
        } else {
            delete_note_from_sync(conn, &entity_id, |note_id| invalidate_cache(note_id))?;
        }

        upsert_sync_revision(
            conn,
            &LocalSyncRevision {
                recipient: meta.recipient.clone(),
                d_tag: meta.document_coord.clone(),
                rev: meta.revision_id.clone(),
                op: meta.op.clone(),
                mtime: meta.mtime,
                entity_type: meta.entity_type.clone(),
                payload_event_id: Some(event.id.to_hex()),
                payload_retained: true,
                relay_url: Some(relay_url.to_string()),
                stored_seq,
                created_at: event.created_at.as_secs() as i64,
            },
        )?;
        replace_sync_revision_parents(
            conn,
            &meta.recipient,
            &meta.document_coord,
            &meta.revision_id,
            &meta.parent_revision_ids,
        )?;
        replace_sync_heads(
            conn,
            &meta.recipient,
            &meta.document_coord,
            &[LocalSyncHead {
                recipient: meta.recipient.clone(),
                d_tag: meta.document_coord.clone(),
                rev: meta.revision_id.clone(),
                op: meta.op.clone(),
                mtime: meta.mtime,
            }],
        )?;
        Some(SyncChangePayload {
            note_id: entity_id,
            action: "delete".to_string(),
        })
    } else if is_notebook_rumor(&unwrapped.rumor) {
        let notebook = rumor_to_synced_notebook(&unwrapped.rumor)?;
        upsert_notebook_from_sync(conn, &notebook, &event.id.to_hex())?;

        upsert_sync_revision(
            conn,
            &LocalSyncRevision {
                recipient: meta.recipient.clone(),
                d_tag: meta.document_coord.clone(),
                rev: meta.revision_id.clone(),
                op: meta.op.clone(),
                mtime: meta.mtime,
                entity_type: meta.entity_type.clone(),
                payload_event_id: Some(event.id.to_hex()),
                payload_retained: true,
                relay_url: Some(relay_url.to_string()),
                stored_seq,
                created_at: event.created_at.as_secs() as i64,
            },
        )?;
        replace_sync_revision_parents(
            conn,
            &meta.recipient,
            &meta.document_coord,
            &meta.revision_id,
            &meta.parent_revision_ids,
        )?;
        replace_sync_heads(
            conn,
            &meta.recipient,
            &meta.document_coord,
            &[LocalSyncHead {
                recipient: meta.recipient.clone(),
                d_tag: meta.document_coord.clone(),
                rev: meta.revision_id.clone(),
                op: meta.op.clone(),
                mtime: meta.mtime,
            }],
        )?;
        conn.execute(
            "UPDATE notebooks SET current_rev = ?1 WHERE id = ?2",
            params![meta.revision_id, notebook.id],
        )?;
        Some(SyncChangePayload {
            note_id: notebook.id,
            action: "upsert".to_string(),
        })
    } else {
        if let Some(ref blossom_url) = preferred_blossom_url {
            let pubkey_hex = keys.public_key().to_hex();
            for tag in unwrapped.rumor.tags.filter(TagKind::custom("blob")) {
                let parts = tag.as_slice();
                if parts.len() < 4 {
                    continue;
                }
                conn.execute(
                    "INSERT OR REPLACE INTO blob_meta (plaintext_hash, server_url, pubkey, ciphertext_hash, encryption_key)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![parts[1], blossom_url, pubkey_hex, parts[2], parts[3]],
                )?;
            }
        }

        let note = rumor_to_synced_note(&unwrapped.rumor)?;
        let note_id = note.id.clone();
        let updated = upsert_from_sync(conn, &note, &event.id.to_hex())?;

        upsert_sync_revision(
            conn,
            &LocalSyncRevision {
                recipient: meta.recipient.clone(),
                d_tag: meta.document_coord.clone(),
                rev: meta.revision_id.clone(),
                op: meta.op.clone(),
                mtime: meta.mtime,
                entity_type: meta.entity_type.clone(),
                payload_event_id: Some(event.id.to_hex()),
                payload_retained: true,
                relay_url: Some(relay_url.to_string()),
                stored_seq,
                created_at: event.created_at.as_secs() as i64,
            },
        )?;
        replace_sync_revision_parents(
            conn,
            &meta.recipient,
            &meta.document_coord,
            &meta.revision_id,
            &meta.parent_revision_ids,
        )?;
        replace_sync_heads(
            conn,
            &meta.recipient,
            &meta.document_coord,
            &[LocalSyncHead {
                recipient: meta.recipient.clone(),
                d_tag: meta.document_coord.clone(),
                rev: meta.revision_id.clone(),
                op: meta.op.clone(),
                mtime: meta.mtime,
            }],
        )?;

        if updated.is_some() {
            conn.execute(
                "UPDATE notes SET current_rev = ?1 WHERE id = ?2",
                params![meta.revision_id, note_id],
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
        let min_payload_mtime =
            crate::adapters::sqlite::revision_sync_repository::get_sync_relay_state(
                conn, relay_url,
            )?
            .and_then(|state| state.min_payload_mtime);
        upsert_sync_relay_state(
            conn,
            relay_url,
            Some(stored_seq),
            Some(stored_seq),
            Some(crate::domain::common::time::now_millis()),
            min_payload_mtime,
        )?;
    }

    Ok(change_payload)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::sqlite::migrations::account_migrations;
    use crate::domain::sync::event_codec::{deleted_note_rumor, deleted_notebook_rumor};
    use crate::domain::sync::revision_codec::{
        build_revision_note_rumor, canonicalize_revision_payload, compute_document_coord,
        compute_revision_id, revision_envelope_tags, RevisionEnvelopeMeta, RevisionRumorInput,
        REVISION_SYNC_SCHEMA_VERSION,
    };
    use rusqlite::Connection;

    fn setup_db() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        account_migrations().to_latest(&mut conn).unwrap();
        conn
    }

    #[test]
    fn applies_remote_note_revision_and_updates_current_rev() {
        let conn = setup_db();
        let keys = Keys::generate();
        let recipient = keys.public_key();
        let note_id = "note-1";
        let document_coord = compute_document_coord(keys.secret_key(), note_id);
        let canonical_payload = canonicalize_revision_payload(
            &recipient.to_hex(),
            &document_coord,
            &[],
            "put",
            "note",
            "Title",
            "# Title\n\nBody",
            None,
            100,
            200,
            200,
            None,
            None,
            None,
            false,
            &["alpha".to_string()],
        )
        .unwrap();
        let revision_id = compute_revision_id(keys.secret_key(), &canonical_payload).unwrap();
        let rumor = build_revision_note_rumor(
            RevisionRumorInput {
                document_id: note_id,
                title: "Title",
                markdown: "# Title\n\nBody",
                notebook_id: None,
                created_at: 100,
                modified_at: 200,
                edited_at: 200,
                archived_at: None,
                deleted_at: None,
                pinned_at: None,
                readonly: false,
                tags: &["alpha".to_string()],
                blob_tags: &[],
                entity_type: "note",
                parent_revision_ids: &[],
                op: "put",
            },
            keys.public_key(),
        );
        let event = crate::adapters::nostr::nip59_ext::gift_wrap(
            &keys,
            &recipient,
            rumor,
            revision_envelope_tags(&RevisionEnvelopeMeta {
                recipient: recipient.to_hex(),
                document_coord: document_coord.clone(),
                revision_id: revision_id.clone(),
                parent_revision_ids: vec![],
                op: "put".into(),
                mtime: 200,
                entity_type: None,
                schema_version: REVISION_SYNC_SCHEMA_VERSION.into(),
            }),
        )
        .unwrap();

        let change =
            apply_remote_revision_event(&conn, "wss://relay.example", &keys, &event, Some(7), |_| {})
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
    fn applies_remote_note_revision_persists_blob_metadata() {
        let conn = setup_db();
        let keys = Keys::generate();
        let recipient = keys.public_key();
        let note_id = "note-blob";
        let document_coord = compute_document_coord(keys.secret_key(), note_id);
        let hash = "a".repeat(64);
        let ciphertext_hash = "b".repeat(64);
        let key_hex = "c".repeat(64);

        conn.execute(
            "INSERT INTO app_settings (key, value) VALUES ('blossom_url', 'https://blobs.example.com')",
            [],
        )
        .unwrap();

        let markdown = format!("# Title\n\n![img](attachment://{hash}.png)");
        let canonical_payload = canonicalize_revision_payload(
            &recipient.to_hex(),
            &document_coord,
            &[],
            "put",
            "note",
            "Title",
            &markdown,
            None,
            100,
            200,
            200,
            None,
            None,
            None,
            false,
            &[],
        )
        .unwrap();
        let revision_id = compute_revision_id(keys.secret_key(), &canonical_payload).unwrap();
        let rumor = build_revision_note_rumor(
            RevisionRumorInput {
                document_id: note_id,
                title: "Title",
                markdown: &markdown,
                notebook_id: None,
                created_at: 100,
                modified_at: 200,
                edited_at: 200,
                archived_at: None,
                deleted_at: None,
                pinned_at: None,
                readonly: false,
                tags: &[],
                blob_tags: &[(hash.clone(), ciphertext_hash.clone(), key_hex.clone())],
                entity_type: "note",
                parent_revision_ids: &[],
                op: "put",
            },
            keys.public_key(),
        );
        let event = crate::adapters::nostr::nip59_ext::gift_wrap(
            &keys,
            &recipient,
            rumor,
            revision_envelope_tags(&RevisionEnvelopeMeta {
                recipient: recipient.to_hex(),
                document_coord: document_coord.clone(),
                revision_id: revision_id.clone(),
                parent_revision_ids: vec![],
                op: "put".into(),
                mtime: 200,
                entity_type: None,
                schema_version: REVISION_SYNC_SCHEMA_VERSION.into(),
            }),
        )
        .unwrap();

        let change =
            apply_remote_revision_event(&conn, "ws://relay.example", &keys, &event, Some(1), |_| {})
                .unwrap();

        let stored: Option<(String, String, String)> = conn
            .query_row(
                "SELECT server_url, ciphertext_hash, encryption_key
                 FROM blob_meta
                 WHERE plaintext_hash = ?1 AND pubkey = ?2",
                params![hash, recipient.to_hex()],
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
        let recipient = keys.public_key();
        let document_coord = compute_document_coord(keys.secret_key(), "note-1");
        let canonical_payload = serde_json::to_string(&serde_json::json!({
            "strategy": crate::domain::sync::revision_codec::REVISION_SYNC_STRATEGY,
            "recipient": recipient.to_hex(),
            "d": document_coord,
            "parents": [],
            "op": "del",
            "type": "note",
            "entity_id": "note-1",
            "mtime": 300,
            "schema_version": REVISION_SYNC_SCHEMA_VERSION,
        }))
        .unwrap();
        let revision_id = compute_revision_id(keys.secret_key(), &canonical_payload).unwrap();
        let event = crate::adapters::nostr::nip59_ext::gift_wrap(
            &keys,
            &recipient,
            deleted_note_rumor("note-1", keys.public_key()),
            revision_envelope_tags(&RevisionEnvelopeMeta {
                recipient: recipient.to_hex(),
                document_coord,
                revision_id: revision_id.clone(),
                parent_revision_ids: vec![],
                op: "del".into(),
                mtime: 300,
                entity_type: None,
                schema_version: REVISION_SYNC_SCHEMA_VERSION.into(),
            }),
        )
        .unwrap();

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
                params![
                    recipient.to_hex(),
                    compute_document_coord(keys.secret_key(), "note-1")
                ],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(head_op, "del");
    }

    #[test]
    fn applies_remote_notebook_deletion_revision() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO notebooks (id, name, created_at, updated_at)
             VALUES ('notebook-1', 'Notebook', 100, 200)",
            [],
        )
        .unwrap();

        let keys = Keys::generate();
        let recipient = keys.public_key();
        let document_coord = compute_document_coord(keys.secret_key(), "notebook:notebook-1");
        let canonical_payload = serde_json::to_string(&serde_json::json!({
            "strategy": crate::domain::sync::revision_codec::REVISION_SYNC_STRATEGY,
            "recipient": recipient.to_hex(),
            "d": document_coord,
            "parents": [],
            "op": "del",
            "type": "notebook",
            "entity_id": "notebook-1",
            "mtime": 300,
            "schema_version": REVISION_SYNC_SCHEMA_VERSION,
        }))
        .unwrap();
        let revision_id = compute_revision_id(keys.secret_key(), &canonical_payload).unwrap();
        let event = crate::adapters::nostr::nip59_ext::gift_wrap(
            &keys,
            &recipient,
            deleted_notebook_rumor("notebook-1", keys.public_key()),
            revision_envelope_tags(&RevisionEnvelopeMeta {
                recipient: recipient.to_hex(),
                document_coord,
                revision_id: revision_id.clone(),
                parent_revision_ids: vec![],
                op: "del".into(),
                mtime: 300,
                entity_type: None,
                schema_version: REVISION_SYNC_SCHEMA_VERSION.into(),
            }),
        )
        .unwrap();

        apply_remote_revision_event(&conn, "wss://relay.example", &keys, &event, Some(9), |_| {})
            .unwrap();

        let remaining: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM notebooks WHERE id = 'notebook-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(remaining, 0);

        let head_op: String = conn
            .query_row(
                "SELECT op FROM sync_heads WHERE recipient = ?1 AND d_tag = ?2",
                params![
                    recipient.to_hex(),
                    compute_document_coord(keys.secret_key(), "notebook:notebook-1")
                ],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(head_op, "del");
    }
}
