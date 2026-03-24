use crate::adapters::sqlite::revision_sync_repository::{
    replace_sync_heads, replace_sync_revision_parents, upsert_sync_revision, LocalSyncHead,
    LocalSyncRevision,
};
use crate::domain::sync::revision_codec::{
    build_revision_note_rumor, canonicalize_revision_payload, compute_document_d_tag,
    compute_revision_id, revision_envelope_tags, RevisionEnvelopeMeta, RevisionRumorInput,
    REVISION_SYNC_SCHEMA_VERSION,
};
use crate::error::AppError;
use nostr_sdk::prelude::*;
use rusqlite::{params, Connection, OptionalExtension};

pub struct PendingNoteRevision {
    pub note_id: String,
    pub recipient: String,
    pub d_tag: String,
    pub revision_id: String,
    pub parent_revision_ids: Vec<String>,
    pub mtime: i64,
    pub tags: Vec<Tag>,
    pub rumor: UnsignedEvent,
    pub op: String,
}

pub struct PendingNotebookRevision {
    pub notebook_id: String,
    pub recipient: String,
    pub d_tag: String,
    pub revision_id: String,
    pub parent_revision_ids: Vec<String>,
    pub mtime: i64,
    pub tags: Vec<Tag>,
    pub rumor: UnsignedEvent,
    pub op: String,
}

pub struct PendingDeletionRevision {
    pub recipient: String,
    pub d_tag: String,
    pub revision_id: String,
    pub parent_revision_ids: Vec<String>,
    pub mtime: i64,
    pub rumor: UnsignedEvent,
    pub op: String,
    pub entity_type: String,
}

pub fn build_pending_note_revision(
    conn: &Connection,
    keys: &Keys,
    recipient: &PublicKey,
    note_id: &str,
) -> Result<PendingNoteRevision, AppError> {
    let row: Option<(
        String,
        String,
        Option<String>,
        i64,
        i64,
        Option<i64>,
        Option<i64>,
        Option<i64>,
        bool,
        Option<String>,
        Option<i64>,
    )> = conn
        .query_row(
            "SELECT title, markdown, notebook_id, created_at, modified_at, edited_at, archived_at, deleted_at, readonly, current_rev, pinned_at
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
                    row.get(7)?,
                    row.get::<_, i64>(8)? != 0,
                    row.get(9)?,
                    row.get(10)?,
                ))
            },
        )
        .optional()?;

    let (
        title,
        markdown,
        notebook_id,
        created_at,
        modified_at,
        edited_at,
        archived_at,
        deleted_at,
        readonly,
        current_rev,
        pinned_at,
    ) = row.ok_or_else(|| AppError::custom(format!("Note not found: {note_id}")))?;

    let edited_at = edited_at.unwrap_or(modified_at);

    let parent_revision_ids = current_rev.into_iter().collect::<Vec<_>>();
    let recipient_hex = recipient.to_hex();
    let d_tag = compute_document_d_tag(keys.secret_key(), note_id);

    let note_tags = {
        let mut stmt =
            conn.prepare("SELECT tag FROM note_tags WHERE note_id = ?1 ORDER BY tag ASC")?;
        let rows = stmt.query_map(params![note_id], |row| row.get(0))?;
        rows.collect::<Result<Vec<String>, _>>()?
    };

    let canonical_payload = canonicalize_revision_payload(
        &recipient_hex,
        &d_tag,
        &parent_revision_ids,
        "put",
        "note",
        &title,
        &markdown,
        notebook_id.as_deref(),
        created_at,
        modified_at,
        edited_at,
        archived_at,
        deleted_at,
        pinned_at,
        readonly,
        &note_tags,
    )?;
    let revision_id = compute_revision_id(keys.secret_key(), &canonical_payload)?;

    let rumor = build_revision_note_rumor(
        RevisionRumorInput {
            document_id: note_id,
            title: &title,
            markdown: &markdown,
            notebook_id: notebook_id.as_deref(),
            created_at,
            modified_at,
            edited_at,
            archived_at,
            deleted_at,
            pinned_at,
            readonly,
            tags: &note_tags,
            entity_type: "note",
            parent_revision_ids: &parent_revision_ids,
            op: "put",
        },
        keys.public_key(),
    );

    let tags = revision_envelope_tags(&RevisionEnvelopeMeta {
        recipient: recipient_hex.clone(),
        d_tag: d_tag.clone(),
        revision_id: revision_id.clone(),
        parent_revision_ids: parent_revision_ids.clone(),
        op: "put".to_string(),
        mtime: modified_at,
        entity_type: Some("note".to_string()),
        schema_version: REVISION_SYNC_SCHEMA_VERSION.to_string(),
    });

    Ok(PendingNoteRevision {
        note_id: note_id.to_string(),
        recipient: recipient_hex,
        d_tag,
        revision_id,
        parent_revision_ids,
        mtime: modified_at,
        tags,
        rumor,
        op: "put".to_string(),
    })
}

pub fn persist_local_note_revision(
    conn: &Connection,
    revision: &PendingNoteRevision,
) -> Result<(), AppError> {
    upsert_sync_revision(
        conn,
        &LocalSyncRevision {
            recipient: revision.recipient.clone(),
            d_tag: revision.d_tag.clone(),
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
        &revision.d_tag,
        &revision.revision_id,
        &revision.parent_revision_ids,
    )?;

    replace_sync_heads(
        conn,
        &revision.recipient,
        &revision.d_tag,
        &[LocalSyncHead {
            recipient: revision.recipient.clone(),
            d_tag: revision.d_tag.clone(),
            rev: revision.revision_id.clone(),
            op: revision.op.clone(),
            mtime: revision.mtime,
        }],
    )?;

    conn.execute(
        "UPDATE notes SET current_rev = ?1 WHERE id = ?2",
        params![revision.revision_id, revision.note_id],
    )?;

    Ok(())
}

pub fn build_pending_notebook_revision(
    conn: &Connection,
    keys: &Keys,
    recipient: &PublicKey,
    notebook_id: &str,
) -> Result<PendingNotebookRevision, AppError> {
    let row: Option<(String, i64, Option<String>)> = conn
        .query_row(
            "SELECT name, updated_at, current_rev FROM notebooks WHERE id = ?1",
            params![notebook_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?;

    let (name, updated_at, current_rev) =
        row.ok_or_else(|| AppError::custom(format!("Notebook not found: {notebook_id}")))?;

    let parent_revision_ids = current_rev.into_iter().collect::<Vec<_>>();
    let recipient_hex = recipient.to_hex();
    let d_tag = compute_document_d_tag(keys.secret_key(), &format!("notebook:{notebook_id}"));

    let canonical_payload = serde_json::to_string(&serde_json::json!({
        "strategy": crate::domain::sync::revision_codec::REVISION_SYNC_STRATEGY,
        "recipient": recipient_hex,
        "d": d_tag,
        "parents": parent_revision_ids.clone(),
        "op": "put",
        "type": "notebook",
        "name": name,
        "updated_at": updated_at,
        "schema_version": crate::domain::sync::revision_codec::REVISION_SYNC_SCHEMA_VERSION,
    }))
    .map_err(|e| {
        AppError::custom(format!(
            "Failed to canonicalize notebook revision payload: {e}"
        ))
    })?;
    let revision_id = compute_revision_id(keys.secret_key(), &canonical_payload)?;

    let rumor = crate::domain::sync::event_codec::notebook_to_rumor(
        notebook_id,
        &name,
        updated_at,
        keys.public_key(),
    );

    let tags = revision_envelope_tags(&RevisionEnvelopeMeta {
        recipient: recipient_hex.clone(),
        d_tag: d_tag.clone(),
        revision_id: revision_id.clone(),
        parent_revision_ids: parent_revision_ids.clone(),
        op: "put".to_string(),
        mtime: updated_at,
        entity_type: Some("notebook".to_string()),
        schema_version: REVISION_SYNC_SCHEMA_VERSION.to_string(),
    });

    Ok(PendingNotebookRevision {
        notebook_id: notebook_id.to_string(),
        recipient: recipient_hex,
        d_tag,
        revision_id,
        parent_revision_ids,
        mtime: updated_at,
        tags,
        rumor,
        op: "put".to_string(),
    })
}

pub fn persist_local_notebook_revision(
    conn: &Connection,
    revision: &PendingNotebookRevision,
) -> Result<(), AppError> {
    upsert_sync_revision(
        conn,
        &LocalSyncRevision {
            recipient: revision.recipient.clone(),
            d_tag: revision.d_tag.clone(),
            rev: revision.revision_id.clone(),
            op: revision.op.clone(),
            mtime: revision.mtime,
            entity_type: Some("notebook".to_string()),
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
        &revision.d_tag,
        &revision.revision_id,
        &revision.parent_revision_ids,
    )?;

    replace_sync_heads(
        conn,
        &revision.recipient,
        &revision.d_tag,
        &[LocalSyncHead {
            recipient: revision.recipient.clone(),
            d_tag: revision.d_tag.clone(),
            rev: revision.revision_id.clone(),
            op: revision.op.clone(),
            mtime: revision.mtime,
        }],
    )?;

    conn.execute(
        "UPDATE notebooks SET current_rev = ?1 WHERE id = ?2",
        params![revision.revision_id, revision.notebook_id],
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

    let parent_revision_ids = current_rev.into_iter().collect::<Vec<_>>();
    let recipient_hex = recipient.to_hex();
    let d_tag = compute_document_d_tag(keys.secret_key(), note_id);
    let canonical_payload = serde_json::to_string(&serde_json::json!({
        "strategy": crate::domain::sync::revision_codec::REVISION_SYNC_STRATEGY,
        "recipient": recipient_hex,
        "d": d_tag,
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

    Ok(PendingDeletionRevision {
        recipient: recipient_hex,
        d_tag,
        revision_id,
        parent_revision_ids,
        mtime: now,
        rumor,
        op: "del".to_string(),
        entity_type: "note".to_string(),
    })
}

pub fn build_pending_notebook_deletion_revision(
    conn: &Connection,
    keys: &Keys,
    recipient: &PublicKey,
    notebook_id: &str,
    now: i64,
) -> Result<PendingDeletionRevision, AppError> {
    let current_rev: Option<String> = conn
        .query_row(
            "SELECT current_rev FROM notebooks WHERE id = ?1",
            params![notebook_id],
            |row| row.get(0),
        )
        .optional()?
        .flatten();

    let parent_revision_ids = current_rev.into_iter().collect::<Vec<_>>();
    let recipient_hex = recipient.to_hex();
    let d_tag = compute_document_d_tag(keys.secret_key(), &format!("notebook:{notebook_id}"));
    let canonical_payload = serde_json::to_string(&serde_json::json!({
        "strategy": crate::domain::sync::revision_codec::REVISION_SYNC_STRATEGY,
        "recipient": recipient_hex,
        "d": d_tag,
        "parents": parent_revision_ids.clone(),
        "op": "del",
        "type": "notebook",
        "entity_id": notebook_id,
        "mtime": now,
        "schema_version": crate::domain::sync::revision_codec::REVISION_SYNC_SCHEMA_VERSION,
    }))
    .map_err(|e| {
        AppError::custom(format!(
            "Failed to canonicalize notebook deletion payload: {e}"
        ))
    })?;
    let revision_id = compute_revision_id(keys.secret_key(), &canonical_payload)?;
    let rumor =
        crate::domain::sync::event_codec::deleted_notebook_rumor(notebook_id, keys.public_key());

    Ok(PendingDeletionRevision {
        recipient: recipient_hex,
        d_tag,
        revision_id,
        parent_revision_ids,
        mtime: now,
        rumor,
        op: "del".to_string(),
        entity_type: "notebook".to_string(),
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
            d_tag: revision.d_tag.clone(),
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
        &revision.d_tag,
        &revision.revision_id,
        &revision.parent_revision_ids,
    )?;

    replace_sync_heads(
        conn,
        &revision.recipient,
        &revision.d_tag,
        &[LocalSyncHead {
            recipient: revision.recipient.clone(),
            d_tag: revision.d_tag.clone(),
            rev: revision.revision_id.clone(),
            op: revision.op.clone(),
            mtime: revision.mtime,
        }],
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
             VALUES ('note-1', 'Title', '# Title\n\nBody', 100, 200, 200, 1)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO note_tags (note_id, tag) VALUES ('note-1', 'alpha'), ('note-1', 'beta')",
            [],
        )
        .unwrap();
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
        assert_eq!(revision.d_tag, revision_again.d_tag);
        assert_eq!(revision.recipient, recipient.to_hex());
        assert!(revision.tags.iter().any(|tag| tag.as_slice()[0] == "r"));
        assert!(revision.tags.iter().any(|tag| tag.as_slice()[0] == "m"));
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
    fn builds_notebook_revision() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO notebooks (id, name, created_at, updated_at, locally_modified)
             VALUES ('notebook-1', 'Notebook', 100, 200, 1)",
            [],
        )
        .unwrap();
        let keys = Keys::generate();
        let recipient = Keys::generate().public_key();

        let revision =
            build_pending_notebook_revision(&conn, &keys, &recipient, "notebook-1").unwrap();

        assert_eq!(revision.notebook_id, "notebook-1");
        assert_eq!(revision.recipient, recipient.to_hex());
        assert!(revision.tags.iter().any(|tag| tag.as_slice()[0] == "r"));
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
