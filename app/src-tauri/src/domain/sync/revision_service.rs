use crate::adapters::sqlite::revision_sync_repository::{
    apply_sync_head_update, list_sync_heads_for_scope, list_sync_revision_parents,
    replace_sync_revision_parents, upsert_sync_revision, LocalSyncRevision,
};
use crate::domain::blob::service::extract_attachment_hashes;
use crate::domain::sync::revision_codec::{
    build_revision_note_rumor, canonicalize_revision_payload, compute_document_coord,
    compute_revision_id, revision_envelope_tags, RevisionEnvelopeMeta, RevisionRumorInput,
    REVISION_SYNC_SCHEMA_VERSION,
};
use crate::error::AppError;
use nostr_sdk::prelude::*;
use rusqlite::{params, Connection, OptionalExtension};

pub struct PendingNoteRevision {
    pub note_id: String,
    pub recipient: String,
    pub document_coord: String,
    pub revision_id: String,
    pub parent_revision_ids: Vec<String>,
    pub mtime: i64,
    pub tags: Vec<Tag>,
    pub rumor: UnsignedEvent,
    pub op: String,
}

pub struct PendingDeletionRevision {
    pub recipient: String,
    pub document_coord: String,
    pub revision_id: String,
    pub parent_revision_ids: Vec<String>,
    pub mtime: i64,
    pub tags: Vec<Tag>,
    pub rumor: UnsignedEvent,
    pub op: String,
    pub entity_type: String,
}

struct NoteRevisionFields {
    title: String,
    markdown: String,
    created_at: i64,
    modified_at: i64,
    edited_at: i64,
    archived_at: Option<i64>,
    deleted_at: Option<i64>,
    readonly: bool,
    current_rev: Option<String>,
    pinned_at: Option<i64>,
    sync_event_id: Option<String>,
}

fn current_parent_revision_ids_for_scope(
    conn: &Connection,
    recipient: &str,
    document_coord: &str,
    fallback_current_rev: Option<String>,
) -> Result<Vec<String>, AppError> {
    let mut parent_revision_ids = list_sync_heads_for_scope(conn, recipient, document_coord)?
        .into_iter()
        .map(|head| head.rev)
        .collect::<Vec<_>>();

    if parent_revision_ids.is_empty() {
        parent_revision_ids = fallback_current_rev.into_iter().collect();
    }

    parent_revision_ids.sort();
    parent_revision_ids.dedup();
    Ok(parent_revision_ids)
}

fn load_note_revision_fields(
    conn: &Connection,
    note_id: &str,
) -> Result<NoteRevisionFields, AppError> {
    let row: Option<(
        String,
        String,
        i64,
        i64,
        Option<i64>,
        Option<i64>,
        Option<i64>,
        bool,
        Option<String>,
        Option<i64>,
        Option<String>,
    )> = conn
        .query_row(
            "SELECT title, markdown, created_at, modified_at, edited_at, archived_at, deleted_at, readonly, current_rev, pinned_at, sync_event_id
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
                    row.get(10)?,
                ))
            },
        )
        .optional()?;

    let (
        title,
        markdown,
        created_at,
        modified_at,
        edited_at,
        archived_at,
        deleted_at,
        readonly,
        current_rev,
        pinned_at,
        sync_event_id,
    ) = row.ok_or_else(|| AppError::custom(format!("Note not found: {note_id}")))?;

    Ok(NoteRevisionFields {
        title,
        markdown,
        created_at,
        modified_at,
        edited_at: edited_at.unwrap_or(modified_at),
        archived_at,
        deleted_at,
        readonly,
        current_rev,
        pinned_at,
        sync_event_id,
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

fn load_blob_tags(
    conn: &Connection,
    markdown: &str,
    recipient_hex: &str,
) -> Result<Vec<(String, String, String)>, AppError> {
    let preferred_blossom_url: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'blossom_url'",
            [],
            |row| row.get(0),
        )
        .optional()?;

    let mut blob_tags = Vec::new();
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
                params![hash, recipient_hex, blossom_url],
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
                params![hash, recipient_hex],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?
        };

        if let Some((ciphertext_hash, key_hex)) = meta {
            blob_tags.push((hash, ciphertext_hash, key_hex));
        } else if preferred_blossom_url.is_some() {
            return Err(AppError::custom(format!(
                "Missing encrypted blob metadata for attachment: {hash}"
            )));
        }
    }

    Ok(blob_tags)
}

pub fn build_pending_note_revision(
    conn: &Connection,
    keys: &Keys,
    recipient: &PublicKey,
    note_id: &str,
) -> Result<PendingNoteRevision, AppError> {
    let fields = load_note_revision_fields(conn, note_id)?;

    let recipient_hex = recipient.to_hex();
    let document_coord = compute_document_coord(keys.secret_key(), note_id);
    let parent_revision_ids = current_parent_revision_ids_for_scope(
        conn,
        &recipient_hex,
        &document_coord,
        fields.current_rev.clone(),
    )?;
    let direct_tag_paths = load_direct_tag_paths(conn, note_id)?;
    let blob_tags = load_blob_tags(conn, &fields.markdown, &recipient_hex)?;

    let canonical_payload = canonicalize_revision_payload(
        &recipient_hex,
        &document_coord,
        &parent_revision_ids,
        "put",
        "note",
        &fields.title,
        &fields.markdown,
        fields.created_at,
        fields.modified_at,
        fields.edited_at,
        fields.archived_at,
        fields.deleted_at,
        fields.pinned_at,
        fields.readonly,
        &direct_tag_paths,
    )?;
    let revision_id = compute_revision_id(keys.secret_key(), &canonical_payload)?;

    let rumor = build_revision_note_rumor(
        RevisionRumorInput {
            document_id: note_id,
            title: &fields.title,
            markdown: &fields.markdown,
            created_at: fields.created_at,
            modified_at: fields.modified_at,
            edited_at: fields.edited_at,
            archived_at: fields.archived_at,
            deleted_at: fields.deleted_at,
            pinned_at: fields.pinned_at,
            readonly: fields.readonly,
            tags: &direct_tag_paths,
            blob_tags: &blob_tags,
            entity_type: "note",
            parent_revision_ids: &parent_revision_ids,
            op: "put",
        },
        keys.public_key(),
    );

    let tags = revision_envelope_tags(&RevisionEnvelopeMeta {
        recipient: recipient_hex.clone(),
        document_coord: document_coord.clone(),
        revision_id: revision_id.clone(),
        parent_revision_ids: parent_revision_ids.clone(),
        op: "put".to_string(),
        mtime: fields.modified_at,
        entity_type: None,
        schema_version: REVISION_SYNC_SCHEMA_VERSION.to_string(),
    });

    Ok(PendingNoteRevision {
        note_id: note_id.to_string(),
        recipient: recipient_hex,
        document_coord,
        revision_id,
        parent_revision_ids,
        mtime: fields.modified_at,
        tags,
        rumor,
        op: "put".to_string(),
    })
}

pub fn build_materialized_note_revision_for_publish(
    conn: &Connection,
    keys: &Keys,
    recipient: &PublicKey,
    note_id: &str,
) -> Result<Option<PendingNoteRevision>, AppError> {
    let fields = load_note_revision_fields(conn, note_id)?;
    let Some(current_rev) = fields.current_rev.clone() else {
        return Ok(None);
    };

    if fields.sync_event_id.is_some() {
        return Ok(None);
    }

    let recipient_hex = recipient.to_hex();
    let document_coord = compute_document_coord(keys.secret_key(), note_id);
    let parent_revision_ids =
        list_sync_revision_parents(conn, &recipient_hex, &document_coord, &current_rev)?;
    let direct_tag_paths = load_direct_tag_paths(conn, note_id)?;
    let blob_tags = load_blob_tags(conn, &fields.markdown, &recipient_hex)?;

    let canonical_payload = canonicalize_revision_payload(
        &recipient_hex,
        &document_coord,
        &parent_revision_ids,
        "put",
        "note",
        &fields.title,
        &fields.markdown,
        fields.created_at,
        fields.modified_at,
        fields.edited_at,
        fields.archived_at,
        fields.deleted_at,
        fields.pinned_at,
        fields.readonly,
        &direct_tag_paths,
    )?;
    let revision_id = compute_revision_id(keys.secret_key(), &canonical_payload)?;
    if revision_id != current_rev {
        return Ok(None);
    }

    let rumor = build_revision_note_rumor(
        RevisionRumorInput {
            document_id: note_id,
            title: &fields.title,
            markdown: &fields.markdown,
            created_at: fields.created_at,
            modified_at: fields.modified_at,
            edited_at: fields.edited_at,
            archived_at: fields.archived_at,
            deleted_at: fields.deleted_at,
            pinned_at: fields.pinned_at,
            readonly: fields.readonly,
            tags: &direct_tag_paths,
            blob_tags: &blob_tags,
            entity_type: "note",
            parent_revision_ids: &parent_revision_ids,
            op: "put",
        },
        keys.public_key(),
    );
    let tags = revision_envelope_tags(&RevisionEnvelopeMeta {
        recipient: recipient_hex.clone(),
        document_coord: document_coord.clone(),
        revision_id: revision_id.clone(),
        parent_revision_ids: parent_revision_ids.clone(),
        op: "put".to_string(),
        mtime: fields.modified_at,
        entity_type: None,
        schema_version: REVISION_SYNC_SCHEMA_VERSION.to_string(),
    });

    Ok(Some(PendingNoteRevision {
        note_id: note_id.to_string(),
        recipient: recipient_hex,
        document_coord,
        revision_id,
        parent_revision_ids,
        mtime: fields.modified_at,
        tags,
        rumor,
        op: "put".to_string(),
    }))
}

pub fn materialize_note_revision_locally(
    conn: &Connection,
    keys: &Keys,
    recipient: &PublicKey,
    note_id: &str,
    mark_locally_modified: bool,
) -> Result<String, AppError> {
    let fields = load_note_revision_fields(conn, note_id)?;
    let recipient_hex = recipient.to_hex();
    let document_coord = compute_document_coord(keys.secret_key(), note_id);
    let parent_revision_ids = current_parent_revision_ids_for_scope(
        conn,
        &recipient_hex,
        &document_coord,
        fields.current_rev.clone(),
    )?;
    let direct_tag_paths = load_direct_tag_paths(conn, note_id)?;
    let canonical_payload = canonicalize_revision_payload(
        &recipient_hex,
        &document_coord,
        &parent_revision_ids,
        "put",
        "note",
        &fields.title,
        &fields.markdown,
        fields.created_at,
        fields.modified_at,
        fields.edited_at,
        fields.archived_at,
        fields.deleted_at,
        fields.pinned_at,
        fields.readonly,
        &direct_tag_paths,
    )?;
    let revision_id = compute_revision_id(keys.secret_key(), &canonical_payload)?;

    upsert_sync_revision(
        conn,
        &LocalSyncRevision {
            recipient: recipient_hex.clone(),
            d_tag: document_coord.clone(),
            rev: revision_id.clone(),
            op: "put".to_string(),
            mtime: fields.modified_at,
            entity_type: Some("note".to_string()),
            payload_event_id: None,
            payload_retained: true,
            relay_url: None,
            stored_seq: None,
            created_at: fields.modified_at,
        },
    )?;
    replace_sync_revision_parents(
        conn,
        &recipient_hex,
        &document_coord,
        &revision_id,
        &parent_revision_ids,
    )?;
    apply_sync_head_update(
        conn,
        &recipient_hex,
        &document_coord,
        &revision_id,
        "put",
        fields.modified_at,
        &parent_revision_ids,
    )?;
    conn.execute(
        "UPDATE notes
         SET current_rev = ?1,
             locally_modified = CASE
               WHEN ?3 = 1 AND sync_event_id IS NULL THEN 1
               ELSE locally_modified
             END
         WHERE id = ?2",
        params![revision_id, note_id, i32::from(mark_locally_modified)],
    )?;

    Ok(revision_id)
}

pub fn persist_local_note_revision(
    conn: &Connection,
    revision: &PendingNoteRevision,
) -> Result<(), AppError> {
    upsert_sync_revision(
        conn,
        &LocalSyncRevision {
            recipient: revision.recipient.clone(),
            d_tag: revision.document_coord.clone(),
            rev: revision.revision_id.clone(),
            op: revision.op.clone(),
            mtime: revision.mtime,
            entity_type: Some("note".to_string()),
            payload_event_id: None,
            payload_retained: true,
            relay_url: None,
            stored_seq: None,
            created_at: revision.mtime,
        },
    )?;

    replace_sync_revision_parents(
        conn,
        &revision.recipient,
        &revision.document_coord,
        &revision.revision_id,
        &revision.parent_revision_ids,
    )?;

    apply_sync_head_update(
        conn,
        &revision.recipient,
        &revision.document_coord,
        &revision.revision_id,
        &revision.op,
        revision.mtime,
        &revision.parent_revision_ids,
    )?;

    // `sync_heads` is the authoritative graph head set and may eventually hold
    // multiple conflicting heads for the same document. `current_rev` is only
    // the single revision this local note row is materialized from.
    conn.execute(
        "UPDATE notes SET current_rev = ?1 WHERE id = ?2",
        params![revision.revision_id, revision.note_id],
    )?;

    Ok(())
}

pub fn build_pending_note_deletion_revision(
    conn: &Connection,
    keys: &Keys,
    recipient: &PublicKey,
    note_id: &str,
    now: i64,
) -> Result<PendingDeletionRevision, AppError> {
    let current_rev: Option<String> = conn
        .query_row(
            "SELECT current_rev FROM notes WHERE id = ?1",
            params![note_id],
            |row| row.get(0),
        )
        .optional()?
        .flatten();
    let recipient_hex = recipient.to_hex();
    let document_coord = compute_document_coord(keys.secret_key(), note_id);
    let parent_revision_ids =
        current_parent_revision_ids_for_scope(conn, &recipient_hex, &document_coord, current_rev)?;
    let canonical_payload = serde_json::to_string(&serde_json::json!({
        "strategy": crate::domain::sync::revision_codec::REVISION_SYNC_STRATEGY,
        "recipient": recipient_hex,
        "d": document_coord,
        "parents": parent_revision_ids.clone(),
        "op": "del",
        "type": "note",
        "entity_id": note_id,
        "mtime": now,
        "schema_version": crate::domain::sync::revision_codec::REVISION_SYNC_SCHEMA_VERSION,
    }))
    .map_err(|e| AppError::custom(format!("Failed to canonicalize note deletion payload: {e}")))?;
    let revision_id = compute_revision_id(keys.secret_key(), &canonical_payload)?;
    let rumor = crate::domain::sync::event_codec::deleted_note_rumor(note_id, keys.public_key());
    let tags = revision_envelope_tags(&RevisionEnvelopeMeta {
        recipient: recipient_hex.clone(),
        document_coord: document_coord.clone(),
        revision_id: revision_id.clone(),
        parent_revision_ids: parent_revision_ids.clone(),
        op: "del".to_string(),
        mtime: now,
        entity_type: None,
        schema_version: REVISION_SYNC_SCHEMA_VERSION.to_string(),
    });

    Ok(PendingDeletionRevision {
        recipient: recipient_hex,
        document_coord,
        revision_id,
        parent_revision_ids,
        mtime: now,
        tags,
        rumor,
        op: "del".to_string(),
        entity_type: "note".to_string(),
    })
}

pub fn persist_local_deletion_revision(
    conn: &Connection,
    revision: &PendingDeletionRevision,
) -> Result<(), AppError> {
    upsert_sync_revision(
        conn,
        &LocalSyncRevision {
            recipient: revision.recipient.clone(),
            d_tag: revision.document_coord.clone(),
            rev: revision.revision_id.clone(),
            op: revision.op.clone(),
            mtime: revision.mtime,
            entity_type: Some(revision.entity_type.clone()),
            payload_event_id: None,
            payload_retained: true,
            relay_url: None,
            stored_seq: None,
            created_at: revision.mtime,
        },
    )?;

    replace_sync_revision_parents(
        conn,
        &revision.recipient,
        &revision.document_coord,
        &revision.revision_id,
        &revision.parent_revision_ids,
    )?;

    apply_sync_head_update(
        conn,
        &revision.recipient,
        &revision.document_coord,
        &revision.revision_id,
        &revision.op,
        revision.mtime,
        &revision.parent_revision_ids,
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
    fn builds_stable_pending_note_revision() {
        let conn = setup_db();
        let keys = Keys::generate();
        let recipient = Keys::generate().public_key();

        let revision = build_pending_note_revision(&conn, &keys, &recipient, "note-1").unwrap();
        let revision_again =
            build_pending_note_revision(&conn, &keys, &recipient, "note-1").unwrap();

        assert_eq!(revision.revision_id, revision_again.revision_id);
        assert_eq!(revision.document_coord, revision_again.document_coord);
        assert_eq!(revision.recipient, recipient.to_hex());
        assert!(revision.tags.iter().any(|tag| tag.as_slice()[0] == "r"));
        assert!(revision.tags.iter().any(|tag| tag.as_slice()[0] == "m"));
    }

    #[test]
    fn builds_note_revision_with_blob_tags_from_metadata() {
        let conn = setup_db();
        let keys = Keys::generate();
        let recipient = Keys::generate().public_key();
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
            params![hash, recipient.to_hex(), ciphertext_hash, key_hex],
        )
        .unwrap();

        let revision = build_pending_note_revision(&conn, &keys, &recipient, "note-1").unwrap();
        let blob_tag = revision
            .rumor
            .tags
            .find(TagKind::custom("blob"))
            .expect("blob tag should be present");

        assert_eq!(
            blob_tag.as_slice(),
            vec!["blob".to_string(), hash, ciphertext_hash, key_hex,]
        );
    }

    #[test]
    fn persists_local_revision_and_updates_current_rev() {
        let conn = setup_db();
        let keys = Keys::generate();
        let recipient = Keys::generate().public_key();

        let revision = build_pending_note_revision(&conn, &keys, &recipient, "note-1").unwrap();
        persist_local_note_revision(&conn, &revision).unwrap();

        let current_rev: Option<String> = conn
            .query_row(
                "SELECT current_rev FROM notes WHERE id = 'note-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(current_rev, Some(revision.revision_id.clone()));
    }

    #[test]
    fn builds_note_deletion_revision() {
        let conn = setup_db();
        let keys = Keys::generate();
        let recipient = Keys::generate().public_key();

        let revision =
            build_pending_note_deletion_revision(&conn, &keys, &recipient, "note-1", 300).unwrap();

        assert!(!revision.revision_id.is_empty());
        assert_eq!(revision.op, "del");
        assert_eq!(revision.entity_type, "note");
    }
}
