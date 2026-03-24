use crate::adapters::sqlite::revision_sync_repository::{
    replace_sync_heads, replace_sync_revision_parents, upsert_sync_relay_state,
    upsert_sync_revision, LocalSyncHead, LocalSyncRevision,
};
use crate::domain::sync::event_codec::{
    is_deleted_rumor, is_notebook_rumor, rumor_to_synced_note, rumor_to_synced_notebook,
};
use crate::domain::sync::revision_codec::parse_revision_envelope_meta;
use crate::domain::sync::service::{
    delete_note_from_sync, delete_notebook_from_sync, upsert_from_sync, upsert_notebook_from_sync,
};
use crate::error::AppError;
use nostr_sdk::prelude::*;
use rusqlite::{params, Connection};

pub fn apply_remote_revision_event(
    conn: &Connection,
    relay_url: &str,
    keys: &Keys,
    event: &Event,
    stored_seq: Option<i64>,
    mut invalidate_cache: impl FnMut(&str),
) -> Result<(), AppError> {
    let meta = parse_revision_envelope_meta(event)?;
    let unwrapped = crate::adapters::nostr::nip59_ext::extract_rumor(keys, event)?;

    if is_deleted_rumor(&unwrapped.rumor) {
        let entity_id = unwrapped
            .rumor
            .tags
            .find(TagKind::d())
            .and_then(|tag| tag.content())
            .ok_or_else(|| AppError::custom("Missing d tag in deleted revision rumor"))?
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
                d_tag: meta.d_tag.clone(),
                rev: meta.revision_id.clone(),
                op: meta.op.clone(),
                mtime: meta.mtime,
                entity_type: Some(meta.entity_type.clone()),
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
            &meta.d_tag,
            &meta.revision_id,
            &meta.parent_revision_ids,
        )?;
        replace_sync_heads(
            conn,
            &meta.recipient,
            &meta.d_tag,
            &[LocalSyncHead {
                recipient: meta.recipient.clone(),
                d_tag: meta.d_tag.clone(),
                rev: meta.revision_id.clone(),
                op: meta.op.clone(),
                mtime: meta.mtime,
            }],
        )?;
    } else if is_notebook_rumor(&unwrapped.rumor) {
        let notebook = rumor_to_synced_notebook(&unwrapped.rumor)?;
        upsert_notebook_from_sync(conn, &notebook, &event.id.to_hex())?;

        upsert_sync_revision(
            conn,
            &LocalSyncRevision {
                recipient: meta.recipient.clone(),
                d_tag: meta.d_tag.clone(),
                rev: meta.revision_id.clone(),
                op: meta.op.clone(),
                mtime: meta.mtime,
                entity_type: Some(meta.entity_type.clone()),
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
            &meta.d_tag,
            &meta.revision_id,
            &meta.parent_revision_ids,
        )?;
        replace_sync_heads(
            conn,
            &meta.recipient,
            &meta.d_tag,
            &[LocalSyncHead {
                recipient: meta.recipient.clone(),
                d_tag: meta.d_tag.clone(),
                rev: meta.revision_id.clone(),
                op: meta.op.clone(),
                mtime: meta.mtime,
            }],
        )?;
        conn.execute(
            "UPDATE notebooks SET current_rev = ?1 WHERE id = ?2",
            params![meta.revision_id, notebook.id],
        )?;
    } else {
        let note = rumor_to_synced_note(&unwrapped.rumor)?;
        let note_id = note.id.clone();
        let updated = upsert_from_sync(conn, &note, &event.id.to_hex())?;

        upsert_sync_revision(
            conn,
            &LocalSyncRevision {
                recipient: meta.recipient.clone(),
                d_tag: meta.d_tag.clone(),
                rev: meta.revision_id.clone(),
                op: meta.op.clone(),
                mtime: meta.mtime,
                entity_type: Some(meta.entity_type.clone()),
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
            &meta.d_tag,
            &meta.revision_id,
            &meta.parent_revision_ids,
        )?;
        replace_sync_heads(
            conn,
            &meta.recipient,
            &meta.d_tag,
            &[LocalSyncHead {
                recipient: meta.recipient.clone(),
                d_tag: meta.d_tag.clone(),
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
        }
    }

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

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::sqlite::migrations::account_migrations;
    use crate::domain::sync::event_codec::{deleted_note_rumor, deleted_notebook_rumor};
    use crate::domain::sync::revision_codec::{
        build_revision_note_rumor, canonicalize_revision_payload, compute_document_d_tag,
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
        let d_tag = compute_document_d_tag(keys.secret_key(), note_id);
        let canonical_payload = canonicalize_revision_payload(
            &recipient.to_hex(),
            &d_tag,
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
                d_tag: d_tag.clone(),
                revision_id: revision_id.clone(),
                parent_revision_ids: vec![],
                op: "put".into(),
                mtime: 200,
                entity_type: "note".into(),
                schema_version: REVISION_SYNC_SCHEMA_VERSION.into(),
            }),
        )
        .unwrap();

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
        let d_tag = compute_document_d_tag(keys.secret_key(), "note-1");
        let canonical_payload = serde_json::to_string(&serde_json::json!({
            "strategy": crate::domain::sync::revision_codec::REVISION_SYNC_STRATEGY,
            "recipient": recipient.to_hex(),
            "d": d_tag,
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
                d_tag,
                revision_id: revision_id.clone(),
                parent_revision_ids: vec![],
                op: "del".into(),
                mtime: 300,
                entity_type: "note".into(),
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
                    compute_document_d_tag(keys.secret_key(), "note-1")
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
        let d_tag = compute_document_d_tag(keys.secret_key(), "notebook:notebook-1");
        let canonical_payload = serde_json::to_string(&serde_json::json!({
            "strategy": crate::domain::sync::revision_codec::REVISION_SYNC_STRATEGY,
            "recipient": recipient.to_hex(),
            "d": d_tag,
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
                d_tag,
                revision_id: revision_id.clone(),
                parent_revision_ids: vec![],
                op: "del".into(),
                mtime: 300,
                entity_type: "notebook".into(),
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
                    compute_document_d_tag(keys.secret_key(), "notebook:notebook-1")
                ],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(head_op, "del");
    }
}
