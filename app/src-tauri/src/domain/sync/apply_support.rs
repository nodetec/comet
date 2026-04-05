use crate::domain::sync::model::SyncedNote;
use crate::error::AppError;
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

pub(crate) const DEVICE_ID_KEY: &str = "sync_device_id";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ExistingSyncedNote {
    pub id: String,
    pub is_locally_modified: bool,
    pub markdown: String,
    pub device_id: String,
    pub created_at: i64,
    pub edited_at: i64,
    pub archived_at: Option<i64>,
    pub pinned_at: Option<i64>,
    pub readonly: bool,
    pub vector_clock_json: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ExistingTombstone {
    pub device_id: String,
    pub deleted_at: i64,
    pub vector_clock_json: String,
    pub snapshot_event_id: Option<String>,
}

pub(crate) fn snapshot_content_matches(note: &SyncedNote, existing: &ExistingSyncedNote) -> bool {
    existing.markdown == note.markdown
        && existing.device_id == note.device_id
        && existing.created_at == note.created_at
        && existing.edited_at == note.edited_at
        && existing.archived_at == note.archived_at
        && existing.pinned_at == note.pinned_at
        && existing.readonly == note.readonly
}

pub(crate) fn current_device_id(conn: &Connection) -> Result<String, AppError> {
    let existing: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![DEVICE_ID_KEY],
            |row| row.get(0),
        )
        .optional()?;

    if let Some(device_id) = existing {
        if !device_id.trim().is_empty() {
            return Ok(device_id);
        }
    }

    let device_id = Uuid::new_v4().hyphenated().to_string().to_uppercase();
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![DEVICE_ID_KEY, device_id],
    )?;
    Ok(device_id)
}

pub(crate) fn load_existing_note(
    conn: &Connection,
    note_id: &str,
) -> Result<Option<ExistingSyncedNote>, AppError> {
    conn.query_row(
        "SELECT id,
                locally_modified != 0,
                markdown,
                COALESCE(last_edit_device_id, ''),
                created_at,
                edited_at,
                archived_at,
                pinned_at,
                readonly != 0,
                COALESCE(vector_clock, '{}')
         FROM notes
         WHERE id = ?1",
        params![note_id],
        |row| {
            Ok(ExistingSyncedNote {
                id: row.get(0)?,
                is_locally_modified: row.get(1)?,
                markdown: row.get(2)?,
                device_id: row.get(3)?,
                created_at: row.get(4)?,
                edited_at: row.get(5)?,
                archived_at: row.get(6)?,
                pinned_at: row.get(7)?,
                readonly: row.get(8)?,
                vector_clock_json: row.get(9)?,
            })
        },
    )
    .optional()
    .map_err(Into::into)
}

pub(crate) fn load_existing_tombstone(
    conn: &Connection,
    note_id: &str,
) -> Result<Option<ExistingTombstone>, AppError> {
    conn.query_row(
        "SELECT last_edit_device_id,
                deleted_at,
                vector_clock,
                snapshot_event_id
         FROM note_tombstones
         WHERE id = ?1",
        params![note_id],
        |row| {
            Ok(ExistingTombstone {
                device_id: row.get(0)?,
                deleted_at: row.get(1)?,
                vector_clock_json: row.get(2)?,
                snapshot_event_id: row.get(3)?,
            })
        },
    )
    .optional()
    .map_err(Into::into)
}

pub(crate) fn clear_note_materialization(conn: &Connection, note_id: &str) -> Result<(), AppError> {
    conn.execute(
        "DELETE FROM note_tag_links WHERE note_id = ?1",
        params![note_id],
    )?;
    conn.execute("DELETE FROM notes_fts WHERE note_id = ?1", params![note_id])?;
    conn.execute("DELETE FROM notes WHERE id = ?1", params![note_id])?;
    Ok(())
}

pub(crate) fn clear_note_tombstone_state(conn: &Connection, note_id: &str) -> Result<(), AppError> {
    conn.execute(
        "DELETE FROM note_tombstones WHERE id = ?1",
        params![note_id],
    )?;
    conn.execute(
        "DELETE FROM pending_deletions WHERE entity_id = ?1",
        params![note_id],
    )?;
    Ok(())
}
